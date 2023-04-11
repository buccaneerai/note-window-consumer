const get = require('lodash/get');
const fs = require('fs');
const {concat} = require('rxjs');
const {map} = require('rxjs/operators');

const toPredictions = require('../operators/toPredictions');

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY must be set!');  // eslint-disable-line
  process.exit(1);
}

// We can move these into other files if we want.
const TRANSCRIPTS = {
  demo: {
    name: 'Demo',
    runId: 'a',
    script: [{
      start: 0,
      text: "Hi. Hi, my name is Aspen Fieldscout. I'm Dr. Briar Hayfield. How can I help you? Hi, uh, I've got this crazy bad headache. Okay, can you tell me a little bit more about it? Um, well, it just woke up with me this morning and it's been like this since about 5. And it's just been like, just terrible since. Okay, where does it hurt? Right here. Ah, sorry. Were you feeling fine when you went to bed last night? Well, I sort of felt actually kind of feverish. My son has actually been sick for a couple days and I thought, I said to my wife, I think I'm getting what Liam's got. And so I sort of felt like sick, like maybe nauseated, but then that's it. Okay, with this headache, are you having any other symptoms? Like you're getting a blurred vision or anything like that? Or numbness or weakness? Uh, no. But the only thing that is like the pain was just so bad. I was just throwing up with the pain. It was crazy. Like it still is. It's just so bad, right? You look pretty uncomfortable. Okay, I'm going to get my nurse to put an IV and give you something for the pain. Is that okay? Okay. Heavy grace. Okay. A little bit more about this headache. You get headaches ever. Do you ever have any problems with headaches? No, no. Okay. Do you have any other medical problems? I've got some asthma and I've also got like some car sickness. I've been told once before that's like there's a large family history of migraines in my family. That might be connected. My asthma has been pretty bad, pretty stable. Okay. Do you take any medications? Yeah, I'm on an orange puffer. I take all the time. I think it's flovent or flotsil-thing or something like that. And I've got the blue puffer, but I almost never have to take it. Do you have any allergies? No, not at all. Okay. Now you tell me your kid's a bit sick right now, but you woke up with a sudden onset of a headache. Is that correct? Yeah, like I woke up and was just there and it woke me up. It's just crazy. It's just the worst pain you've ever had. Oh yeah? Did you try anything for that pain? Yeah, I took some Tylenol. I had a couple of strength tablets and that made no difference. Any rash, any diarrhea, any swollen joints, anything like that? No, but my son had a bit of a rash there, right, but I'm sure. Any recent travel? No. No, okay. We're going to get you something for pain. Okay. Okay, so I'm worried about you. I'm worried about a couple things. Okay. I'm worried about the chance of you having meningitis, which is a scary term. You also tell me this is the worst headache of your life. Oh yeah. Also, there's a small chance that there's something else going on, like a small bleed into your brain. So these are both very scary potentially dangerous things. Okay. So we're going to give you something for pain. We're going to send you off for a CAT scan of your brain to make sure there's no blood there or anything else. Okay. And if that's normal, I have to do a lumbar puncture and I have to take some fluid from your spine, alright? Whatever, okay. Okay."
    }],
  },
  tachy: {
    name: 'Tachycardia',
    runId: 'b',
    script: [{
      start: 0,
      text: "Hi Brian. How are you doing today? I’m doing fine, Dr. Mollon. I followed up with the cardiologist like you recommended. Thanks Brian. I’m glad to hear that. Last time you were here about six weeks ago, we talked about the heart rates you saw on your smart watch going up to 200. I’m glad that you were able to see the cardiologist as I recommended. I received the evaluation from cardiology, which ordered the 24 hour Holter monitor and I saw that that study was completed. Thanks for going through all of that. Hopefully it was relatively straightforward and not any problem for you. I don’t know if the cardiologist talked to you about the results, but there were no abnormal readings. Both the cardiologist and I agree that we do not need any additional workup or testing or evaluation for the heart rates you saw in your smart watch. If you do have any symptoms that accompany the heart rates that are high on the smart watch, definitely let me know right away. Otherwise, we can continue to monitor as needed. Thanks, doc. The cardiologist told me the same story and I’m glad that all of this is resolved. I do like the smart watch and use it routinely for exercise and walking and everything, so I’ll continue to do that and I’ll let you know if I have any symptoms or anything and if I see any patterns with the smart watch and the heart rate, I can let you know. But I’m glad everything turned out okay with the testing. That’s great. Do you have any other questions about the heart rate or the smart watch or the Holter monitor testing? No, everything seems fine. I understand everything and appreciate your help with going through the questions I had. No problem Brian. Glad to help out and glad to see that all of the study results are negative and we don’t really need to do anything further. That sounds great to me. We also talked about your hemoglobin last time and over the last six months looked like there was a gradual decrease in the hemoglobin. That may have been a pattern, so I did recommend that colonoscopy. Just wanna make sure that there’s no blood loss occurring in the gastrointestinal tract. Dr. Mollon. I have not had a chance to see the gastroenterologist yet, but I will definitely talk to my son who’s a doctor and decide if you know I wanna see the gastroenterologist and the colonoscopy and where the best place is to go and everything. That’ll be fine. I recommend the colonoscopy, so please let your son know that he can talk to me if he has any questions or would like to discuss your case. Yeah, I’ll do that. Okay, thanks. Otherwise, don’t really need to do anything further with the hemoglobin. We’ll keep on monitoring every three months with blood tests. Thanks. That sounds good. We’re continuing you on the two medications, the Metformin for the pre-diabetes and the Atorvastatin for your cholesterol. Just to review, I saw that you did have the past surgical history of the inguinal repairs and nothing to do there and just wanted to see how you’re doing at home. Yeah, I’m enjoying retirement with my wife and in our house. My son does live nearby. I see him often. He’s a doctor, so I always ask him questions as you know and make sure that everything is good with him. Still not drinking, no alcohol, no smoking, don’t do any other drugs. Great. I just wanted to run through a few other questions to make sure there’s nothing else going on. Sure, that sounds fine. Are you having any headaches or eye symptoms or hearing symptoms? No, nothing at all. Do you have any difficulty breathing or wheezing? No. Are you having any chest pain? Feeling like your heart’s jump or having pain in your legs while walking? No. Do you have any nausea or vomiting, constipation or diarrhea? No, nothing like that. Here’s what we’ll do. We’ll have you continue your metformin for the pre-diabetes. Continue to check the fasting blood sugar every three months. Also, continue the atorvastatin for your cholesterol. In terms of the cardiology evaluation, there’s nothing else to do right now. We’ll just have you follow up with the cardiologist as he recommended once a year. Definitely let me know if there are any symptoms or other concerns with the heart rate or the smart watch in terms of the hemoglobin. Did want you to consider that colonoscopy. Just lemme know if you have any questions and then in terms of following up with me, we’ll just continue every three months. Please get the blood tests for your blood count, the hemoglobin, as well as the lipids, the cholesterol, and your fasting glucose every three months and then we will follow up as needed. Thanks so much for everything, doc. I appreciate your help and I will see you next time. Thanks so much, Brian. Take care."
    }],
  },
  cough: {
    name: 'Cough',
    runId: 'c',
    script: [{
      start: 0,
      text: "Hi August Clancy, how are you doing today? Not so good, doctor. Actually, we're starting a new system here. Would you mind just telling me your first and last name, please? Yeah, Aspen Fieldscout. Alright, and can you also just confirm your date of birth, please? August 18, 1988. Okay, thanks for that. So, tell me, what's going on? Well, I've had a cough for about two weeks now and I just can't seem to get rid of it. Did it start two weeks ago? Well, it kind of started about three weeks ago. Okay. But it's been really bad for the last two weeks. Okay, and over the last two weeks, has it been about the same? Is it getting better, getting worse from the beginning to now? I'd say it's been about the same. It's been about the same. And when it started three weeks ago, was there anything going on that might have started the cough for you? Well, yeah, I started with cold. I had all kinds of gunk in my throat and it was causing me to cough. Okay. But I feel like I got over the cold, but the cough just hasn't gone away. So, what were the other cold symptoms that you had when it started three weeks ago? Well, I had a bit of a fever and a lot of nasal congestion. I felt like my senses were kind of really clogged up. Okay. And so those symptoms have all subsided, but you still have the cough. Is that right? Yeah, I've just been coughing, but it hasn't really been productive. Like I'm not coughing anything up. Okay. So, just a dry cough then? Yeah, just a dry cough. Okay. And over the last few weeks, you said it's been about the same. So, about like, you know, how often are you coughing in a given day? No, it seems to come and go. It seems to be worse when I exercise or like if I'm outside, cold air. Okay. So, cold air makes it worse or more frequent. Exercise makes it worse or more frequent. Is that right? Yeah. I should mention my other doctor thought that I might have asthma. Okay. And have you ever been diagnosed or treated for asthma? I'm not sure if I was officially diagnosed, but they did give me an inhaler. I think it was a flow vent or something like that. Okay. And when's the last time you used that for any asthma-like symptoms? Oh, I haven't used it in months. Okay. So, you haven't done it in the last few weeks or last two or three weeks when you had this cough recently? No. I don't have a prescription for it anymore. Okay. And you don't have any in your home. You don't have any of the inhalers left? No. Okay. That's fine. That could be an option. Tell me if you have any other, you know, associated symptoms with the coughing. Not the cold symptoms, but like in the last week or two, since the cold symptoms mostly subsided, you had any other symptoms associated with the cough? Yeah. Sometimes I feel like a little bit wheezing, and my chest just feels kind of like tight, like inflamed. Okay. Is it painful in your chest? Not painful, just like a little bit of discomfort, I would say. Okay. Can you tell if it's one side of the chest or the other or kind of throughout? I think it's just throughout. Okay. So it's not left or right, just kind of throughout? Yeah. I'd say it's pretty evenly. Okay. Are you having any headaches at all? No. I don't recall having any headaches recently. Any changes in your vision? No. No changes. No blurry vision, double vision, anything like that? No. Nothing like that. And you said before during the cold, three weeks ago, the kind of the nasal congestion, runny nose, and anything like that in the last one or two days or last week? I have noticed a little bit of drip on the back of my throat. Okay. And then any sore throat at all? Again, not the cold part of it, but in the last few days or last week? No, no sore throat. Okay. All right. Any difficulty breathing or shortness of breath? Sometimes I feel a little bit short of breath, especially if I'm exercising or moving around. Okay. And does it feel like you're drowning when you're underwater and you just can't breathe? There's almost like water in your lungs? No. No. Okay. How about any nausea or vomiting? One time I did cough so hard that I vomited a little bit. Okay. But right after the cough? Yeah. Okay. Any nausea otherwise or vomiting otherwise when it's not like right after the cough? No. Okay. What about constipation, diarrhea? No. I haven't noticed anything like that. Okay. Any pain anywhere else in your body, arms, legs, back? No, I don't think so. Okay. And then any changes in sensation like touching things with your hands or kind of feeling the ground on your feet, anything like that? No. No. Okay. All right. So I think what I'd like to do is take a look at your throat and your nose and see if there's anything abnormal that I can see. And then we'll do just a rapid flu test and a rapid COVID test just to rule those out, make sure that there's nothing residual going on from that. But most likely, this sounds like maybe related to a history of asthma or asthma-like condition or maybe even allergies and then a residual cough that sometimes occurs after upper respiratory infection like a cold. And so most likely it is residual cough post URI is what we would call it. And we can try a couple things. I do want to do those lab tests like I mentioned. I'll get you a prescription for Tessalon pearls, which could be helpful reducing the cough. But at first, and then I can also put down just a few over-the-counter medications that might be helpful, like a robotessa or a generic of a robotessa that has dextromethorphan. That'll be a cough suppressant that could help you out as well. And then, you know, I'd suggest we try these for maybe like a week or two, see how it goes. And I think just naturally it will probably recover from this residual cough, just symptomatically like the Tessalon pearls and the cough syrup with the dextromethorphan should help. Okay. Great. Well, thank you, doctor. I really appreciate the help. All right. Thanks for coming in. I think you'll be back to normal soon. Thanks, doctor Briar Hayfield All right."
    }]
  }
};

// this should return an observable
const handleMessage = ({
  _toPredictions = toPredictions,
} = {}) => data => {
  const { script, runId, name, index } = data;
  const noteWindowId = `${runId}${index}`;
  const { text = '', start = 0 } = script[index];

  let words = text.split(' ');
  words = words.map((w) => {
    return {text: w};
  });
  const done$ = _toPredictions()({message: {runId, noteWindowId, start}, words}).pipe(
    map((predictions) => {
      const dir = `./results/${new Date().toJSON().slice(0,10)}/${name}`;
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(`${dir}/${noteWindowId}.json`, JSON.stringify({
        runId,
        noteWindowId,
        start,
        predictions,
      }));

      let str = '';
      const vfMap = {
        context: [],
        cc: [],
        hpi: [],
        ros: [],
        allergies: [],
        rx: [],
        family: [],
        problems: [],
        social: [],
        pmh: [],
      };
      predictions.forEach((vf) => {
        if (vf.findingCode === 'F-Context') {
          vfMap.context.push(vf);
        } else if (vf.findingCode === 'F-ChiefComplaint') {
          vfMap.cc.push(vf);
        } else if (vf.findingCode === 'F-Symptom') {
          vfMap.ros.push(vf);
        } else if (vf.findingCode === 'F-Problem') {
          vfMap.problems.push(vf);
        } else if (vf.findingCode.startsWith('F-Hpi')) {
          vfMap.hpi.push(vf);
        } else if (vf.findingCode === 'F-Allergy') {
          vfMap.allergies.push(vf);
        } else if (vf.findingCode === 'F-Medication') {
          vfMap.rx.push(vf);
        } else if (vf.findingCode === 'F-Family') {
          vfMap.family.push(vf);
        } else if (vf.findingCode === 'F-SocialSummary') {
          vfMap.social.push(vf);
        } else if (vf.findingCode === 'F-Pmh') {
          vfMap.pmh.push(vf);
        }
      });

      // CC
      str += `${name}\n`
      str += `===========\n\n`;

      str += `CC: \n`;
      str += `${get(vfMap, 'cc[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'} \n\n`;

      // HPI
      str += `HPI: \n`;
      str += `${get(vfMap, 'hpi[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // ROS
      str += `ROS: \n`;
      vfMap.ros.forEach((s) => {
        const isAsserted = s.findingAttributes.find((a) => a.findingAttributeKey === 'isAsserted') || {};
        const code = s.findingAttributes.find((a) => a.findingAttributeKey === 'code') || {};
        const bodySystem = s.findingAttributes.find((a) => a.findingAttributeKey === 'bodySystem') || {};
        str += `${get(bodySystem, 'findingAttributeValue', 'Unknown')}: [${get(isAsserted, 'findingAttributeValue', 'Unknown')}] ${get(code, 'findingAttributeDescription', 'Unknown')} \n`
      });
      str += `\n`;

      // PMH
      str += `Past Medical History: \n`;
      str += `${get(vfMap, 'phm[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // FHX
      str += `Family History: \n`;
      str += `${get(vfMap, 'family[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // SHX
      str += `Social History: \n`;
      str += `${get(vfMap, 'social[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // Allergies
      str += `Allergies: \n`;
      str += `${get(vfMap, 'allergies[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // Medications
      str += `Medications: \n`;
      str += `${get(vfMap, 'rx[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // Assessment & Plan
      str += `Assesment & Plan: \n`;
      str += `${get(vfMap, 'problems[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      console.log(str); // eslint-disable-line
      fs.writeFileSync(`${dir}/${runId}.txt`, str);

      return predictions;
    })
  );
  return done$;
};

const performanceTest = () => {
  const tests = [
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.demo,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.tachy,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.cough,
    }),
  ];
  const done$ = concat(...tests);
  done$.subscribe((d) => console.log('DONE!'));  // eslint-disable-line

  return done$;
};

performanceTest();

module.exports = performanceTest;
