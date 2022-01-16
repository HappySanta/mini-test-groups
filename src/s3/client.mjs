import awsS3 from 's3-client';
import url from 'url';

const defaultConfig = {
  ACCESS_KEY: '',
  SECRET_KEY: '',
  REGION: 'us-east-2',
  ENDPOINT: '',
  BUCKET_NAME: '',
  SSL: true,
  PUBLIC_ENDPOINT: '',
  PUBLIC_PREFIX: "",
};

/**
 * @param {{BUCKET_NAME:string,ACCESS_KEY:string,SECRET_KEY:string,ENDPOINT:string,PUBLIC_ENDPOINT:string}} cfg
 */
export function validateS3Config(cfg) {
  if (!cfg.ACCESS_KEY) {
    return 'empty access key';
  }
  if (!cfg.SECRET_KEY) {
    return 'empty secret';
  }
  if (!cfg.BUCKET_NAME) {
    return 'empty bucked name';
  }
  if (!cfg.ENDPOINT) {
    return 'empty endpoint';
  }
  if (!cfg.PUBLIC_ENDPOINT) {
    return 'empty public endpoint';
  }
  if (!cfg.ENDPOINT.startsWith('https://')) {
    return 'endpoint must start with https';
  }
  if (!cfg.PUBLIC_ENDPOINT.startsWith('https://')) {
    return 'public endpoint must start with https';
  }
}


export class S3Storage {
  /**
   * @param {{BUCKET_NAME:string,ACCESS_KEY:string,SECRET_KEY:string,ENDPOINT:string,PUBLIC_ENDPOINT:string}} config
   */
  constructor(config) {
    this.config = {...defaultConfig, ...config};

    this.client = awsS3.createClient({
      maxAsyncS3: 20,     // this is the default
      s3RetryCount: 3,    // this is the default
      s3RetryDelay: 1000, // this is the default
      multipartUploadThreshold: 20971520, // this is the default (20 MB)
      multipartUploadSize: 15728640, // this is the default (15 MB)
      s3Options: {
        accessKeyId: this.config.ACCESS_KEY,
        secretAccessKey: this.config.SECRET_KEY,
        region: this.config.REGION,
        endpoint: this.config.ENDPOINT,
        sslEnabled: this.config.SSL,
        s3BucketEndpoint: false,
        s3ForcePathStyle: true,
        // See: http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property
      },
    });
  }

  /**
   *
   * @param {string} filename
   * @return {string}
   */
  encodeSpecialCharacters(filename) {
    // Note: these characters are valid in URIs, but S3 does not like them for
    // some reason.
    return encodeURI(filename).replace(/[!'()* ]/g, function (char) {
      return '%' + char.charCodeAt(0).toString(16);
    });
  }

  /**
   *
   * @param {string} fileName
   */
  getPublicUrl(fileName) {
    if (this.config.PUBLIC_ENDPOINT) {
      return this.config.PUBLIC_ENDPOINT + fileName;
    }
    if (!this.config.ENDPOINT) {
      return fileName
    }
    let u = this.config.PUBLIC_ENDPOINT || this.config.ENDPOINT
    if (u.indexOf('http') === -1) {
      u = (this.config.SSL ? 'https:' : 'http:') + '//' + u
    }
    const publicUrl = url.parse(u);
    const parts = {
      protocol: publicUrl.protocol || (this.config.SSL ? 'https:' : 'http:'),
      hostname: publicUrl.hostname,
      pathname: '/' + this.config.BUCKET_NAME + '/' + this.encodeSpecialCharacters(fileName),
    };
    return url.format(parts);
  }


  /**
   * @param {string} prefix
   * @param {boolean} recursive
   * @return {Promise<{Contents:{Key:string,LastModified:Date}[]}>}
   */
  listObjects(prefix = '', recursive = false) {
    return new Promise((resolve, reject) => {
      const res = this.client.listObjects({
        s3Params: {
          Bucket: this.config.BUCKET_NAME,
          Prefix: prefix,
        },
        recursive: recursive,
      });
      res.on('data', resolve);
      res.on('error', reject);
    });
  }

  /**
   *
   * @param {string} dirName
   * @param {string} prefix
   * @return {Promise<void>}
   */
  uploadDirToS3(dirName, prefix) {
    return new Promise((resolve, reject) => {
      const res = this.client.uploadDir({
        localDir: dirName,
        s3Params: {
          Prefix: prefix,
          Bucket: this.config.BUCKET_NAME,
        },
        getS3Params: (localFile, stat, callback) => {
          callback(null, {
            Bucket: this.config.BUCKET_NAME,
            Key: localFile.split('/').pop(),
            ACL: 'public-read',
          });
        },
      });
      res.on('error', reject);
      res.on('end', resolve);
    });
  }
}
