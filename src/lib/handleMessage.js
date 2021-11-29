const get = require('lodash/get');
const {of,zip} = require('rxjs');
const {mergeMap} = require('rxjs/operators');

const validateJob = './validateJob';
const toPredictions = '../operators/toPredictions';
const fetchWordsForWindow = './fetchWordsForWindow';
const storePredictions = './storePredictions';
const updateWorkStatus = './updateWorkStatus';

// this should return an observable
const handleMessage = (
  message,
  {
    _fetchWordsForWindow = fetchWordsForWindow,
    // _getPatternMatchingPredictions = getPatternMatchingPredictions,
    _updateWorkStatus = updateWorkStatus,
    _toPredictions = toPredictions,
    _storePredictions = storePredictions,
    _validateJob = validateJob,
  } = {}
) => {
  const shouldUpdateWorkStatus = get(message, 'updateWorkStatus', true);
  const shouldStorePredictions = get(message, 'storePredictions', true);
  const done$ = of(message).pipe(
    mergeMap(_validateJob()),
    mergeMap(m => zip(
      of(m),
      _fetchWordsForWindow({noteWindowId: m.noteWindowId}),
    )),
    mergeMap(([m, words]) => zip(
      of(m),
      of({message: m, words}).pipe(_toPredictions()),
    )),
    mergeMap(([m, predictions]) => zip(
      of(m),
      shouldStorePredictions
      ? _storePredictions()({predictions})
      : of(predictions),
    )),
    mergeMap(([m]) =>
      shouldUpdateWorkStatus
      ? _updateWorkStatus({
        noteWindowId: m.noteWindowId,
      })
      : of(m)
    ),
  );
  return done$;
};

module.exports = handleMessage;
