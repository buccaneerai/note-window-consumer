const { Consumer } = require('sqs-consumer');
const logger = require('@buccaneerai/logging-utils');

const handleMessage = require('./handleMessage');

const logErr = err => logger.error(`Error: ${err.message}\n  `, err.stack);

console.log('SQS_URL', process.env.SQS_URL);
// https://github.com/bbc/sqs-consumer
const start = ({
  queueUrl = process.env.SQS_URL,
  _handleMessage = message => handleMessage(message).toPromise(),
  _logErr = logErr,
  _info = logger.info
} = {}) => {
  const app = Consumer.create({
    queueUrl,
    handleMessage: _handleMessage,
    handleMessageTimeout: 30000,
    pollingWaitTimeMs: 5000,
  });
  app.on('error', _logErr);
  app.on('processing_error', _logErr);
  app.on('timeout_error', _logErr);
  app.on(
    'message_received',
    ({MessageId}) => _info('message.received', {MessageId})
  );
  app.on(
    'message_processed',
    ({MessageId}) => _info('message.processed', {MessageId})
  );
  app.start();
};

module.exports = {start};
