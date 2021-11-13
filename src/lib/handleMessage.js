const {of} = require('rxjs');
const {map,mergeMap} = require('rxjs/operators');

const mapMessageToEvent = require('./mapMessageToEvent');
const parseFlatDataTypesFromEvent = require('./parseFlatDataTypesFromEvent');
const parseJSON = require('./parseJSON');
const storeFlatDataToS3 = require('./storeFlatDataToS3');

const handleMessage = message => {
  const done$ = of(message).pipe(
    // tap(d => console.log('received message with MessageId: ', message.MessageId)),
    mergeMap(parseJSON()),
    // tap(d => console.log('parsedJson', d)),
    map(mapMessageToEvent()),
    // tap(d => console.log('event', d)),
    map(parseFlatDataTypesFromEvent()),
    // tap(d => console.log('flatData', d)),
    mergeMap(storeFlatDataToS3()),
    // tap(d => console.log('Finished message with MessageId', message.MessageId)),
  );
  return done$;
};

module.exports = handleMessage;
