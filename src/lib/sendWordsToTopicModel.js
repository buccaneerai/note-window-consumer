const _ = require('lodash');
const AWS = require('aws-sdk');
const {from,of,throwError} = require('rxjs');
const {map, mergeMap} = require('rxjs/operators');
const randomstring = require('randomstring');

const errors = {
  couldNotParseJSON: () => new Error('could not parse json response from sagemaker'),
};

const topicMap = {
  LABEL_0: 'F-HpiAggravatingFactor-text',
  LABEL_1: 'F-HpiLocation-text',
  LABEL_2: 'F-HpiNeutralFactor-text',
  LABEL_3: 'F-HpiOnset-time',
  LABEL_4: 'F-HpiOnset-trigger',
  LABEL_5: 'F-HpiQuality-text',
  LABEL_6: 'F-HpiRelievingFactor-text',
  LABEL_7: 'F-HpiSeverity-category',
  LABEL_8: 'F-HpiTiming-text',
  LABEL_9: 'F-Symptom',
};

// const generateLocalCredentials = ({
//   token,
//   roleArn,
//   roleSessionName,
//   duration = 3600, // 1 hour
//   _sts = () => new AWS.STS(),
// }) => {
//   const params = {
//     RoleArn: roleArn,
//     WebIdentityToken: token,
//     RoleSessionName: roleSessionName,
//     DurationSeconds: duration,
//   };
//   const promise = _sts().assumeRoleWithWebIdentity(params).promise();
//   const awsCredentials$ = from(promise).pipe(
//     map(response => ({
//       awsAccessKeyId: _.get(response, 'Credentials.AccessKeyId'),
//       awsSecretAccessKey: _.get(response, 'Credentials.SecretAccessKey'),
//     }))
//   );
//   return awsCredentials$;
// };

const labelIsGeneric = l => /^LABEL_\d/.test(l.label);

const mapRawLabel = (_topicMap = topicMap) => l => ({
  label: labelIsGeneric(l) ? _topicMap[l.label] : l.label,
  score: l.score,
});

const mapRawPredictionToClean = ({
  returnAllScores,
  topK,
  modelVersion
}) => p => {
  if (!returnAllScores) return {...mapRawLabel()(p), modelVersion};
  let labels = p
    .sort((a,b) => b.score - a.score)
    .map(mapRawLabel());
  if (topK > 0) labels = labels.slice(0, topK);
  return {labels, modelVersion};
};

const parseResponse = (modelVersion, params) => (response) => {
  const body = _.get(response, 'Body');
  const {returnAllScores = true, topK = 0} = params;
  const jsonStr = body.toString();
  try {
    const rawPredictions = JSON.parse(jsonStr);
    const cleanPredictions = rawPredictions.map(
      mapRawPredictionToClean({returnAllScores, topK, modelVersion})
    );
    return of(cleanPredictions);
  } catch (e) {
    return throwError(errors.couldNotParseJSON());
  }
};

const createClient = ({
  shouldAssumeRole = process.env.NODE_ENV === 'development',
  region = process.env.AWS_REGION,
  roleArn = process.env.SAGEMAKER_ROLE_ARN || 'arn:aws:iam::310840924429:role/LocalSagemakerDeveloper',
  expirationSeconds = 900,
  _sts = () => new AWS.STS(),
  _randomstring = () => randomstring.generate(18),
} = {}) => {
  // when working locally, it is necessary to assume a role in order to
  // hit models hosted in the staging AWS account.
  if (shouldAssumeRole) {
    const params = {
      RoleArn: roleArn,
      RoleSessionName: _randomstring(),
      DurationSeconds: expirationSeconds,
    };
    const promise = _sts().assumeRole(params).promise();
    const response$ = from(promise);
    const sagemaker$ = response$.pipe(
      map(response => ({
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken
        // expiration: response.Expiration,
      })),
      map(roleCreds => new AWS.SageMakerRuntime({
        region,
        ...roleCreds,
      }))
    );
    return sagemaker$;
  }
  // in production, it is not necessary to assume a special role since
  // the docker container is already in the correct AWS account
  const sagemaker$ = of(new AWS.SageMakerRuntime({region}));
  return sagemaker$;
};

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SageMakerRuntime.html#invokeEndpoint-property
const sendWordsToTopicModel = ({
  endpointName,
  returnAllScores = true,
  topK = 3,
  _client = createClient,
} = {}) => transcriptStr => _client().pipe(
  mergeMap(sagemaker => {
    const params = {
      // https://github.com/huggingface/notebooks/blob/main/sagemaker/10_deploy_model_from_s3/deploy_transformer_model_from_s3.ipynb
      Body: JSON.stringify({
        inputs: transcriptStr,
        parameters: {
          return_all_scores: returnAllScores,
        }
      }),
      EndpointName: endpointName,
      ContentType: 'application/json',
      Accept: 'application/json',
    };
    const promise = sagemaker.invokeEndpoint(params).promise();
    const predictions$ = from(promise).pipe(
      mergeMap(parseResponse(endpointName, {returnAllScores, topK}))
    );
    return predictions$;
  })
);

module.exports = sendWordsToTopicModel;
