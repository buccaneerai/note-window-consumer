const get = require('lodash/get');
const {of,zip} = require('rxjs');
const {map,mergeMap} = require('rxjs/operators');

const validateJob = require('./validateJob');
const toPredictions = require('../operators/toPredictions');
const createTask = require('./createTask');
const fetchWordsForWindow = require('./fetchWordsForWindow');
const storePredictions = require('./storePredictions');
const updateWorkStatus = require('./updateWorkStatus');

// this should return an observable
const handleMessage = ({
  _fetchWordsForWindow = fetchWordsForWindow,
  // _getPatternMatchingPredictions = getPatternMatchingPredictions,
  _updateWorkStatus = updateWorkStatus,
  _toPredictions = toPredictions,
  _createTask = createTask,
  _storePredictions = storePredictions,
  _validateJob = validateJob,
} = {}) => message => {
  const shouldUpdateWorkStatus = get(message, 'updateWorkStatus', true);
  const shouldStorePredictions = get(message, 'storePredictions', true);
  const shouldCreateTask = get(message, 'shouldCreateTask', true);
  const done$ = of(message).pipe(
    mergeMap(_validateJob()),
    mergeMap(m => zip(
      of(m),
      _fetchWordsForWindow()({noteWindowId: m.noteWindowId}),
    )),
    mergeMap(([m, words]) => zip(
      of(m),
      _toPredictions()({message: m, words}),
    )),
    mergeMap(([m, predictions]) => zip(
      of(m),
      of(predictions),
      shouldStorePredictions
      ? _storePredictions()({
        predictions: predictions.map(p => ({
          ...p,
          runId: message.runId,
          noteWindowId: message.noteWindowId,
        }))
      })
      : of(predictions),
    )),
    mergeMap(([m, predictions]) => zip(
      of(m),
      of(predictions),
      shouldUpdateWorkStatus
      ? _updateWorkStatus({
        noteWindowId: m.noteWindowId,
      })
      : of(null),
      shouldCreateTask
      ? _createTask({noteWindowId: m.noteWindowId})
      : of(null)
    )),
    map(([,predictions]) => predictions)
  );
  return done$;
};

module.exports = handleMessage;
