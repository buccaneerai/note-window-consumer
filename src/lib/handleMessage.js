const pick = require('lodash/pick');
const {of,zip} = require('rxjs');
const {map,mergeMap} = require('rxjs/operators');

const toPredictions = '../operators/toPredictions';
const fetchWordsForWindow = './fetchWordsForWindow';
const updateWorkStatus = './updateWorkStatus';

// this should return an observable
const handleMessage = (
  message,
  context,
  _fetchWordForWindow = fetchWordsForWindow,
  // _getPatternMatchingPredictions = getPatternMatchingPredictions,
  _updateWorkStatus = updateWorkStatus,
  _toPredictions = toPredictions,
  // _storePredictions = storePredictions,
) => {
  const done$ = of(message).pipe(
    mergeMap(message => zip(
      of(message),
      _fetchWordsForWindow({noteWindowId: message.noteWindowId}),
    )),
    mergeMap(([message, words]) => zip(
      of(message),
      of({message, words}).pipe(_toPredictions()),
    )),
    // mergeMap(([message, predictions]) => zip(
    //   of(message),
    //   _storePredictions({noteWindowId, predictions}) // TODO
    // )),
    mergeMap(([message]) => _updateWorkStatus({
      noteWindowId: message.noteWindowId,
      workStatus: 'readyToAnnotate',
    })),
  );
  return done$;
};

module.exports = handleMessage;
