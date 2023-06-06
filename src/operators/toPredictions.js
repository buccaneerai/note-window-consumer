const isArray = require('lodash/isArray');
const {EMPTY,of,merge,throwError} = require('rxjs');
const {catchError,defaultIfEmpty,reduce} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

const toGPT4 = require('./toGPT4');

const config = require('../lib/config');

const errors = {
  invalidWords: () => new Error('params.words must be an array'),
};


const pipelines = {
  // all of the logic will happen inside this gpt4 to try and
  // parallelize what we are sending to GPT4 or gather multiple
  // sections at the same time from gpt-4
  gpt4: {
    options: ({ runId, run, noteWindowId, noteWindow, start, version='0-0', id='omnibus-gpt-4' }) => {
      return {
        runId,
        run,
        noteWindowId,
        noteWindow,
        start,
        pipelineId: `${id}-${version}`,
        model: 'gpt-4',
        endpointName: config().ROS_TOPIC_MODEL_ENDPOINT || 'huggingface-pytorch-inference-2023-03-08-19-26-49-250' // not being used at the moment
      };
    },
    operator: toGPT4,
  }
}

const toPredictions = ({_pipelines = pipelines, _logger = logger} = {}) => (
  ({message, words}) => {
    if (!isArray(words)) return throwError(errors.invalidWords);
    if (words.length === 0) return of(); // no predictions
    const pipelineKeys = Object.keys(_pipelines);
    const observables = pipelineKeys.map(key => of(words).pipe(
      _pipelines[key].operator(_pipelines[key].options(message)),
      // handle any uncaught errors in the pipelines
      catchError(err => {
        _logger.error(err);
        return EMPTY;
      })
    ));
    const predictions$ = merge(...observables).pipe(
      // accumulate all predictions into a single flattened array
      reduce((acc, next) => [...acc, ...next], []),
      // if no predictions are emitted, then emit an empty array
      defaultIfEmpty([])
    );
    return predictions$;
  }
);

module.exports = toPredictions;
