const { Consumer } = require('sqs-consumer');
const logger = require('@buccaneerai/logging-utils');

const handleMessage = require('../lib/handleMessage');

const logErr = err => logger.error(`Error: ${err.message}\n  `, err.stack);

// handleMessage is an observable. Wrap it in a Promise and pass params in
// so that it works with the sqs-consumer package, which expects the handler to
// return a promise
const handler = message => handleMessage(message).toPromise();

logger.info('POLLING_SQS_URL', {url: process.env.SQS_URL});
// https://github.com/bbc/sqs-consumer
const start = ({
  queueUrl = process.env.SQS_URL,
  _handleMessage = handler,
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
