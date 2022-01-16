#! /usr/bin/env node

import { program } from 'commander';
import { S3Storage, validateS3Config } from '../s3/client.mjs';
import shell from 'shelljs';
import prompts from 'prompts';
import fs from 'fs';
import path from 'path';
import { config, readS3Config } from '../config/reader.mjs';
import { VkApi } from '../api.mjs';

program.version('0.0.1');
program
  .option('-v, --verbose', 'output extra debugging')
  .option('-c, --check-only', 'Проверить что все файлы закомичены и выйти')
  .option('-f, --force', 'Пропустить проверки на некаомиченные файлы')
  .option('-d, --domain <name>', 'Название тестового домена')
  .option('--s3-upload-prefix <name>', 'Название папки в s3 куда загружать билд')
  .option('--vk-app-id <vkAppId>', 'app id for update test group in')
  .option('--s3-access-key <key>', 'S3 access key')
  .option('--s3-secret-key <secret>', 'S3 secret key')
  .option('--s3-endpoint <endpoint>', 'S3 endpoint start with http')
  .option('--s3-region <region>', 'S3 region', 'ru-1')
  .option('--s3-bucked <bucked>', 'S3 bucked name')
  .option('--s3-public-prefix <prefix>', 'S3 public prefix start with https')
  .option('-b, --build <buildDir>', 'directory with static files', 'build');

program.parse(process.argv);
const options = program.opts();

function verbose() {
  if (options.verbose) {
    console.log.apply(this, arguments);
  }
}

verbose('Args', options);

async function createS3DirName() {
  const userEmail = shell.exec('git config user.email', { silent: true }).stdout;
  const userName = userEmail.split('@').shift();
  const remoteUrl = shell.exec('git remote get-url origin', { silent: true }).stdout;
  const repoName = (remoteUrl.split('/').pop() || 'no-repo').replace('.git', '').trim();
  const date = (new Date().toISOString()).replace(/[T:]/gmu, '-').split('.').shift();

  const gitBranch = shell.exec('git branch --show-current', { silent: true }).stdout;
  const clearGitBranch = (gitBranch || 'no-branch').trim().replace(/[^A-z0-9_-]/gmu, '-');

  return `/${repoName}/${date}-${userName}-${clearGitBranch}/`;
}

async function createDomainName() {
  const userEmail = shell.exec('git config user.email', { silent: true }).stdout;
  const userName = userEmail.split('@').shift();
  const gitBranch = shell.exec('git branch --show-current', { silent: true }).stdout;
  return `${userName} ${gitBranch}`.trim();
}

async function work() {
  // проверить что все закомичено и запушено
  const modified = shell.exec('git diff-index --name-status HEAD', { silent: true }).stdout;
  if (modified && !options.force) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      initial: false,
      message: `${modified}\nЕсть несохраненные изменения, продолжить?`,
    });
    if (!response.value) {
      process.exit(1);
      return;
    }
  } else {
    const status = shell.exec('git status', { silent: true }).stdout;
    if (status.indexOf('branch is ahead') !== -1 && !options.force) {
      const response = await prompts({
        type: 'confirm',
        name: 'value',
        initial: false,
        message: `Похоже что текущая ветка не запушена в репозиторий, продолжить?`,
      });
      if (!response.value) {
        process.exit(1);
        return;
      }
    }
  }
  if (options.checkOnly) {
    process.exit(0);
    return;
  }
  // проверка что build существует
  const buildDir = process.env.BUILD_DIR || options.build || 'build';
  const exist = fs.existsSync(buildDir);
  verbose(`build dir`, buildDir);
  verbose(`build dir exists`, exist);
  if (!exist) {
    console.error(`Папки "${buildDir}" не существует`);
    process.exit(1);
  }
  {
    const indexFile = path.join(buildDir, 'index.html');
    const exist = fs.existsSync(indexFile);
    if (!exist) {
      console.error(`В папке "${buildDir}" должен быть index.html`);
      console.error(`${indexFile} не найден`);
      process.exit(1);
    }
  }

  const s3Config = readS3Config(options);
  const error = validateS3Config(s3Config);
  if (error) {
    console.error('bad s3 config:', error);
    process.exit(1);
  }

// папка в s3
  const s3Dir = process.env.S3_UPLOAD_PREFIX || options.s3UploadPrefix || (await createS3DirName());
  verbose('s3 prefix to upload:', s3Dir);
// название домена
  const domainName = process.env.DOMAIN || options.domain || (await createDomainName());
  verbose('domain name:', domainName);

  const s3 = new S3Storage(s3Config);
  verbose('s3 config', s3Config);

  console.log('start upload to', s3Dir);
  await s3.uploadDirToS3(buildDir, s3Dir);
  console.log('uploaded successful');
  const url = s3.getPublicUrl(`${s3Dir}index.html`);
  console.log(url);

  // обновление группы в миниапе
  const vkAppId = process.env.VK_APP_ID || options.vkAppId;
  if (!vkAppId) {
    console.log('No vk-app-id passed, done');
    return;
  }
  verbose('Work with app id', vkAppId);
  const configTokenKey = `VK_TOKEN_${vkAppId}`;
  let vkAppToken = process.env.VK_APP_TOKEN || config.get(configTokenKey);
  if (!vkAppToken) {
    const response = await prompts({
      type: 'text',
      name: 'meaning',
      message: `Сервисный ключ доступа https://vk.com/editapp?id=${vkAppId}&section=options`,
    });

    if (!response.meaning) {
      return;
    }
    vkAppToken = response.meaning;
    config.set(configTokenKey, vkAppToken);
  }

  const api = new VkApi(vkAppToken, () => {
    config.delete(configTokenKey);
  });
  const groups = await api.status();
  verbose('status', groups);

  let groupId = undefined;
  for (const g of groups) {
    if (g.name === domainName) {
      groupId = g.group_id;
      verbose('found same test domain', g);
    }
  }

  const updatedGroupId = await api.update(url, domainName, groupId);
  verbose('update', updatedGroupId);
  console.log(`Updated successful #${updatedGroupId.group_id}`);
  console.log(`https://vk.com/editapp?id=${vkAppId}&section=testing_groups`);
  console.log(`${domainName}`);
}

work().then(() => {
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
