import Configstore from 'configstore';

export const config = new Configstore("@happysanta/mini-test-groups");

export function readS3Config(options) {
  return {
    ACCESS_KEY: process.env.S3_ACCESS_KEY || options.s3AccessKey || config.get('ACCESS_KEY'),
    SECRET_KEY: process.env.S3_SECRET_KEY || options.s3SecretKey || config.get('SECRET_KEY'),
    REGION: process.env.S3_REGION || options.s3Region || config.get('REGION'),
    ENDPOINT: process.env.S3_ENDPOINT || options.s3Endpoint || config.get('ENDPOINT'),
    BUCKET_NAME: process.env.S3_BUCKET_NAME || options.s3BuckedName || config.get('BUCKET_NAME'),
    PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT || options.s3PublicEndpoint || config.get('PUBLIC_ENDPOINT'),
  }
}
