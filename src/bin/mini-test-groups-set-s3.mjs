#! /usr/bin/env node

import { program } from 'commander';
import { validateS3Config } from '../s3/client.mjs';
import { config, readS3Config } from '../config/reader.mjs';

program.version('0.0.1');
program
  .argument('[s3cfg]', 's3 json config')
  .option('-v, --verbose', 'output extra debugging')
  .option('-p, --print', 'print current s3 config')
  .action((s3cfg) => {
    const opts = program.opts();
    if (opts.verbose) {
      console.log(opts);
    }

    function verbose() {
      if (opts.verbose) {
        console.log.apply(this, arguments);
      }
    }

    if (opts.print) {
      console.log('current config:');
      const data = readS3Config({});
      const error = validateS3Config(data);
      if (error) {
        console.log('not valid', error);
      }
      const jsonCfg = JSON.stringify(data);
      const base64cfg = Buffer.from(jsonCfg).toString('base64');
      console.log(jsonCfg);
      console.log(base64cfg);
      return;
    }
    let data = {};
    try {
      if (s3cfg[0] !== '{') {
        verbose('try decode base64');
        s3cfg = Buffer.from(s3cfg, 'base64').toString('ascii');
      }
      data = JSON.parse(s3cfg);
    } catch (e) {
      console.error('fail parse', s3cfg);
      console.error(e.message);
    }
    verbose(data);
    const error = validateS3Config(data);
    if (error) {
      console.error('config not valid', error);
      process.exit(1);
    }
    config.set(data);
    console.log('config valid, saved');
  });

program.parse(process.argv);
