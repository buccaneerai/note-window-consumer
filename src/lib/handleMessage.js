const get = require('lodash/get');
const {of,zip} = require('rxjs');
const {map,mergeMap} = require('rxjs/operators');

const logger = require('@buccaneerai/logging-utils');

const validateJob = require('./validateJob');
const toPredictions = require('../operators/toPredictions');
const createTask = require('./createTask');
const fetchWordsForWindow = require('./fetchWordsForWindow');
const storePredictions = require('./storePredictions');
const updateWorkStatus = require('./updateWorkStatus');

// LEAVING IN FOR TESTING PURPOSES
// eslint-disable-next-line
// const ORIGINAL_TEXT = "Hi. Hi, my name is Aspen Fieldscout. I'm Dr. Briar Hayfield. How can I help you? Hi, uh, I've got this crazy bad headache. Okay, do you have any nausea? No I don't think so. Um, well, it just woke up with me this morning and it's been like this since about 5. And it's just been like, just terrible since. Okay, where does it hurt? Right here. Ah, sorry. Were you feeling fine when you went to bed last night? Well, I sort of felt actually kind of feverish. My son has actually been sick for a couple days and I thought, I said to my wife, I think I'm getting what Liam's got. And so I sort of felt like sick, like maybe nauseated, but then that's it. Okay, with this headache, are you having any other symptoms? Like you're getting a blurred vision or anything like that? Or numbness or weakness? Uh, no. But the only thing that is like the pain was just so bad. I was just throwing up with the pain. It was crazy. Like it still is. It's just so bad, right? You look pretty uncomfortable. Okay, I'm going to get my nurse to put an IV and give you something for the pain. Is that okay? Okay. Heavy grace. Okay. A little bit more about this headache. You get headaches ever. Do you ever have any problems with headaches? No, no. Okay. Do you have any other medical problems? I've got some asthma and I've also got like some car sickness. I've been told once before that's like there's a large family history of migraines in my family. That might be connected. My asthma has been pretty bad, pretty stable. Okay. Do you take any medications? Yeah, I'm on an orange puffer. I take all the time. I think it's flovent or flotsil-thing or something like that. And I've got the blue puffer, but I almost never have to take it. Do you have any allergies? No, not at all. Okay. Now you tell me your kid's a bit sick right now, but you woke up with a sudden onset of a headache. Is that correct? Yeah, like I woke up and was just there and it woke me up. It's just crazy. It's just the worst pain you've ever had. Oh yeah? Did you try anything for that pain? Yeah, I took some Tylenol. I had a couple of strength tablets and that made no difference. Any rash, any diarrhea, any swollen joints, anything like that? No, but my son had a bit of a rash there, right, but I'm sure. Any recent travel? No. No, okay. We're going to get you something for pain. Okay. Okay, so I'm worried about you. I'm worried about a couple things. Okay. I'm worried about the chance of you having meningitis, which is a scary term. You also tell me this is the worst headache of your life. Oh yeah. Also, there's a small chance that there's something else going on, like a small bleed into your brain. So these are both very scary potentially dangerous things. Okay. So we're going to give you something for pain. We're going to send you off for a CAT scan of your brain to make sure there's no blood there or anything else. Okay. And if that's normal, I have to do a lumbar puncture and I have to take some fluid from your spine, alright? Whatever, okay. Okay."
// let WORDS = ORIGINAL_TEXT.split(' ');
// WORDS = WORDS.map((w) => {
//   return {text: w};
// });

// this should return an observable
const handleMessage = ({
  _fetchWordsForWindow = fetchWordsForWindow,
  // _getPatternMatchingPredictions = getPatternMatchingPredictions,
  _updateWorkStatus = updateWorkStatus,
  _toPredictions = toPredictions,
  _createTask = createTask,
  _storePredictions = storePredictions,
  _validateJob = validateJob,
  _logger = logger
} = {}) => message => {
  const shouldUpdateWorkStatus = get(message, 'updateWorkStatus', true);
  const shouldStorePredictions = get(message, 'storePredictions', true);
  const shouldCreateTask = get(message, 'shouldCreateTask', true);
  _logger.info('handlingMessage', {
    message,
    shouldUpdateWorkStatus,
    shouldStorePredictions,
    shouldCreateTask
  });
  const done$ = of(message).pipe(
    _logger.toLog('processingJob'),
    mergeMap(_validateJob()),
    _logger.toLog('validatedJob'),
    mergeMap(m => zip(
      of(m),
      _fetchWordsForWindow()({noteWindowId: m.noteWindowId}),
    )),
    mergeMap(([m, words]) => zip(
      of(m),
      _toPredictions()({message: m, words}),
    )),
    _logger.toLog('createdPredictions'),
    mergeMap(([m, predictions]) => zip(
      of(m),
      of(predictions),
      shouldStorePredictions && predictions && predictions.length
      ? _storePredictions()({
        predictions: predictions.map(p => ({
          ...p,
          runId: message.runId,
          noteWindowId: message.noteWindowId,
        }))
      })
      : of(predictions),
    )),
    _logger.toLog('storedPredictions.done'),
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
    _logger.toLog('completedJob'),
    map(([,predictions]) => predictions),
    _logger.trace()
  );
  return done$;
};

// LEAVING IN FOR TESTING PURPOSES
// const message$ = handleMessage()({
//   runId: "6400ad16ee7ebed49afb35c7",
//   noteWindowId: "6400ad29ee7ebed49afb35c9"
// });
//
// message$.subscribe((d) => console.log(d));

module.exports = handleMessage;
