const AWS = require('aws-sdk');

// const accountId = process.env.AWS_ACCOUNT_ID;
// if(!accountId) throw new Error('process.env.AWS_ACCOUNT_ID is required');

const ecr = new AWS.ECR({
  apiVersion: '2015-09-21',
  region: 'us-east-1'
});

const params = {
  // registryIds: []
};

ecr.getAuthorizationToken(params, (err, res) => {
  if (err) throw err;
  const token = Buffer.from(res.authorizationData[0].authorizationToken, 'base64').toString('utf8').replace(/^AWS\:/, '');
  console.log(token);
  process.exit(0);
});
