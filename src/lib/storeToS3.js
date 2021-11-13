const get = require('lodash/get');
const isArray = require('lodash/isArray');
const AWS = require('aws-sdk');
const {DateTime} = require('luxon');
const {from} = require('rxjs');

const s3 = new AWS.S3({region: process.env.AWS_REGION});

const storeToS3 = function storeToS3({
  prefix,
  s3Bucket = process.env.S3_BUCKET,
  _s3 = s3
}) {
  return data => {
    // console.log('storeToS3', prefix, s3Bucket, data);

    const _id = data.id || get(data, '[0].eventId');
    const jsonStr = (
      isArray(data)
      ? data.reduce((acc, row) =>
        acc
        ? `${acc}\n${JSON.stringify(row)}`
        : JSON.stringify(row)
      , '')
      : JSON.stringify(data)
    );
    const dateToday = DateTime.local().toFormat('yyyy-MM-dd');
    // console.log('JSON', json, dateToday);
    const s3Params = {
      Bucket: s3Bucket,
      Key: `${prefix}/${dateToday}-${_id}.json`,
      Body: Buffer.from(jsonStr),
      ContentType: 'application/json',
    };
    const promise = _s3.putObject(s3Params).promise();
    return from(promise);
  };
};

module.exports = storeToS3;
