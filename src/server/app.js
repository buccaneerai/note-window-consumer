const get = require('lodash/get');
const { Consumer } = require('sqs-consumer');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

const logger = require('@buccaneerai/logging-utils');

const config = require('../lib/config');
const handleMessage = require('../lib/handleMessage');

const logErr = err => logger.error(err);


logger.info('POLLING_SQS_URL', {url: config().SQS_URL});

// handleMessage is an observable. Wrap it in a Promise and pass params in
// so that it works with the sqs-consumer package, which expects the handler to
// return a promise
const handleSQSResponse = response => {
  try {
    const message = JSON.parse(response.Body);
    const promise = handleMessage()(message).toPromise();
    return promise;
  } catch (e) {
    return Promise.reject(e);
  }
};

// https://github.com/bbc/sqs-consumer
const startConsumer = ({
  queueUrl = config().SQS_URL,
  _handleMessage = handleSQSResponse,
  _logErr = logErr,
  _info = logger.info
} = {}) => {
  const app = Consumer.create({
    queueUrl,
    handleMessage: _handleMessage,
    handleMessageTimeout: 240000,
    visibilityTimeout: 60,
    heartbeatInterval: 30,
    terminateVisibilityTimeout: true,
    pollingWaitTimeMs: 2000,
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

const handleJobPost = ({
  _jobHandler = handleMessage(),
  _logger = logger
} = {}) => (req, res) => {
  const promise = _jobHandler(req.body).toPromise();
  promise
    .then(data => res.json({predictions: data}))
    .catch(err => {
      _logger.error(err);
      res.status(500).send();
    });
};

const startHttpServer = ({
  port = get(config(), 'PORT', 3050),
  _createJob = handleJobPost,
  _logger = logger
} = {}) => {
  const httpApp = express();
  httpApp.use(
    compression(),
    _logger.requestLogger(),
    helmet(),
    cors(),
    express.json()
  );
  // simple HTTP API (so that a workflow can be tested without using SQS)
  const api = express.Router();
  api.post('/job', _createJob());
  httpApp.use('/api', api);
  httpApp.listen(port, () => {
    _logger.info(`listening on port ${port}`, {event: 'httpServer.start'});
  });
};

const start = () => {
  startConsumer();
  // WARNING: the http server doesn't have auth and might not be
  // ready for production usage. It's intended for testing purposes.
  if (process.env.NODE_ENV === 'development') startHttpServer();
};

module.exports = {start};
