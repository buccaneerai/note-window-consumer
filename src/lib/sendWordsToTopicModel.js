const _ = require('lodash');
const AWS = require('aws-sdk');
const {from,of,throwError} = require('rxjs');
const {mergeMap} = require('rxjs/operators');

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

// [{"label":"LABEL_5","score":0.8250104188919067}]
const parseResponse = () => response => {
  const body = _.get(response, 'Body');
  const jsonStr = body.toString();
  try {
    const rawPredictions = JSON.parse(jsonStr);
    const cleanPredictions = rawPredictions.map(p => ({
      label: topicMap[p.label],
      score: p.score,
    }));
    return of(cleanPredictions);
  } catch (e) {
    return throwError(errors.couldNotParseJSON());
  }
};

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SageMakerRuntime.html#invokeEndpoint-property
const sendWordsToTopicModel = ({
  client = () => new AWS.SageMakerRuntime({
    accountId: '310840924429',
    region: process.env.AWS_REGION
  }),
  endpointName = 'huggingface-pytorch-inference-2023-03-01-04-38-47-018',
} = {}) => transcriptStr => {
  const params = {
    // https://github.com/huggingface/notebooks/blob/main/sagemaker/10_deploy_model_from_s3/deploy_transformer_model_from_s3.ipynb
    Body: JSON.stringify({inputs: transcriptStr}),
    EndpointName: endpointName,
    ContentType: 'application/json',
    Accept: 'application/json',
  };
  const promise = client().invokeEndpoint(params).promise();
  const predictions$ = from(promise).pipe(
    mergeMap(parseResponse())
  );
  return predictions$;
};

module.exports = sendWordsToTopicModel;
