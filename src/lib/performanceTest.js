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
  },
  breathing: {
    name: 'Breathing',
    runId: 'd',
    script: [{
      start: 0,
      text: "Hi Sarah. Hi Doctor McCoy. What brings you in today? It looks like you're still having some difficulty breathing and the Flovent steroid I prescribed for you last time haven’t resolved the issue? Tell me what's going on. Yeah. Four weeks ago I had an asthma attack. I have a history of asthma and you prescribed me those steroids for it. I finished that up about two weeks ago. It just came back and it's been worse for the past couple of days. Okay. I’m glad you scheduled this follow up visit. We’ll get this figured out for you. Are you taking any medicines other than the steroids? I’ve been taking an albuterol inhaler when it gets really bad. Has it been getting gradually worse over the last a few days? Yeah it has gotten worse. About three days ago I just started to feel a little more short of breath. Have you been coughing as well? Yeah I have a cough. There has been a little bit of blood. And i've been coughing up green yellow stuff. Okay. um you haven't seen anybody in the last few days since I last saw you? No. Have you been running a fever? i haven't checked Are you having any pain anywhere in your chest? No, I haven’t noticed any pain. For this shortness of breath–is it worse if you try to do anything or is it worse in certain positions? It wasn't before but now like when i'm walking i get a little short breath Anything else like belly pain, nausea, vomiting, diarrhea, urinary symptoms? No nothing like that. What about pain swallowing, rash, headache, racing heart? No just the breathing issues. Okay. Um anything else that's important that i should know about? No not really. I see that you smoke cigarettes. And you’ve been smoking since you were 20? Tell me more about that. How much do you smoke? About half a pack per day Anybody ever talked to you about that before? Yeah Okay. We’ll have a little conversation about that again at the end of the appointment. let's get started with your exam and then get you treated and feeling better. Okay Can you turn your head for me. Tell me if anything back here hurts. Okay I’m just going to listen to your lungs and heart for a minute. Increased expiratory phase. Bilateral wheezes few scattered bronchi. Borderline tachycardia about 100. nothing hurtsthere okay legs okay all right All right well we're going to get you some treatments. You'll get a breathing treatment. You’re also going to need a chest x-ray. We’re also going to do some bloodwork, a CBC panel. I’ll prescribe you another steroid to get you feeling better. And once we get those test results back, I’ll follow up with you."
    }]
  },
  soreThroat: {
    name: 'SoreThroat',
    runId: 'e',
    script: [{
      start: 0,
      text: "Hello. Hi John. I saw from your chart that you've been sick for a little bit. Can you tell me when you started feeling that? Well, yeah. I just had like a really really sore throat for five days and it just keeps getting worse. My neck is like so swollen right here. It's just like hard to swallow. It just it's really sore. Okay, so it's mostly the neck and the throat. And have you had a fever with this, too? Patient: I've had a fever. Doctor: Did you measure it? Patient: Yeah. It was about 99 degrees. Doctor: Okay. Can you remember other people having anything like this around you? Or where you been? Or whether anybody's told you they had strep throat that you've been around? Patient: Um. I mean a few of like my friends and family have been sick like a couple of days ago. We were all at a birthday party. One of my friends she made this punch that was a brand new recipe and she wanted me to try it because she said it was really good. So I took a drink of hers. And then I guess she had been sick but she was getting better. Doctor: Okay. Take me through the last five days you first noticed feeling sick. Patient: It started with the sore throat. I went to urgent care and they just kind of thought it was strep. And so they gave me amoxicillin.  so I ended a strep test and earn it or they might have dentist remember and then the gym I figure in sample as well and they just treat an interest strip and thank you here amoxicillin and are you feeling any better since you've been on my chest oh no it's always been going on since that um my my throat just keeps getting worse and I like thought this rash it's like all over my abdomen and it is an itch or anything it's just what it just came up out of nowhere so I don't even have their related but and then my life my stomach hurts the left side and have you had any other sometimes like cough or shortness of breath or chest pain no are you vomiting nausea no we change in your bowels mm-hmm how about any urinary symptoms burning frequency urgency does the belly n go into the back or doesn't just stay on that it's just on my left side you know the rash she said just came in the last couple of days so doesn't have you started the amoxicillin yeah it was after I saw my doctor okay and doesn't hit you're anything or know any wig pain or swelling mm-hmm nothing in the back and not passing out are you feeling light-headed or anything a little bit able to hear anchors that not work um yeah it's just my throat sword so it's just sort of swallow have you had any major illnesses in the past no abdominal surgeries anything else you can think of that i haven't asked yet I don't think so all right well we're just going to go ahead and do an exam all right open your mouth for me you're alive okay so she has pharyngeal erythema assist my strategy events over there pharyngeal erythema with my lateral exudates and some hypertrophic tonsils and she has some moderate dysphonia when she plots with some mild trismus she has anterior and so mandibular have not the thing and she also has some posterior cervical adenopathy convention that is completely supple take a look at me there's no scleral icterus going is forward for me so take a listen to that we'll take some deep breaths dance or in here in the kidneys and take a listen to the heart I was tachycardia with an S 4 gallon and a 1 / 6 systolic ejection murmur and put you down so I can check let me know if I get anything that hurts nothing mom low that's all okay take a deep breath in let it out slowly is that sore yeah okay so it feels like spleen edge one-finger breadth below the left costal margin and she's got a very fine macular rash across her abdomen and chest and a little bit in her lower extremities and that would be my very sore back here so that's fine no captain entered this all right well I'm concerned that it may not be strapped sometimes mono can look like strip so we're going to do a few tests you look like your little bit dry she actually has some dry mucous membranes please protect me as well and I think that's all we need for the moment and welcome back let you know you."
    }]
  },
  urgentCare: {
    name: 'UrgentCare',
    runId: 'f',
    script: [{
      start: 0,
      text: "Alright, so it's listening now. Good morning John. How are you today? Not so good doctor. Sorry to hear that. I'm doctor, nice to meet you.  Hello. So tell me what brings you in today. I have a really bad sore throat. It's been going on for about five days now. OK. And on a scale of 1 to 10, how bad would you say your throat pain is?  I would say it's about an eight. Okay. And do you any other symptoms besides your throat pain? Yeah, when it started I felt a little feverish.  Like I had some and I felt like I was running hot Did you record your temperature at home? No We exposed anybody else that had anything that you...  No. Yeah, right before this started, my son was sick too. He also had a sore throat and was running a fever. Okay, did you take him to the doctor? Do you know where he got it? Yeah, we took him. They said that he had throat. Oh, okay.  Did you try to help your sore throat to make it better? Yeah, I took some ibuprofen and that helped. And do you have any past medical history John? Like diabetes, high blood pressure, asthma, any chronic conditions? Yeah, I've had asthma for about 10 years now. Do you take any medicines on an everyday I take Flovent to control my asthma. What's all? Allergic to any medicines that you know?  Yeah, I'm allergic to C-chlor.  Okay. Do you smoke cigarettes? No. Drink No. You don't drive it off? Uh... Yeah, I have a history of cocaine abuse. Okay.  or just in the past? No, about 10 years ago. Okay. And... Oh shoot. That might have it up. Watch that in the future. And have you had any surgeries before in your life?  No, only on my wisdom teeth to have those removed. Okay. And are you able to swallow liquids okay? Swallow own saliva? Yeah, it kind of hurts, but I can.  well we're gonna, I'm gonna examine you here first, so listen to your heart and lungs, look in your throat, and then we're gonna order a...  Strap throat swab for you and We get the results back of that I'll come back here and let you know that someone will come in the room in a minute to do your straps  for it. Okay, sounds good. Thank you doctor. All right, so your strep throat test was positive, so that's caused by a bacteria called group A streptococcus. It's probably from what your son may have had as well, so that requires antibiotics. So going to recommend an antibiotic for you to call them boxicillin. What happened when you took C-chloric? What kind of allergy?  Yeah, I'm not really sure I was an infant when it happened. Well, a small likelihood that people that are there See Clark to be allergic to a much than we were taking a moxist on before yeah  have. Okay so we're give you that it'll be one pill twice a day for ten days. I also want you to drink lots of fluids, get plenty of rest.  Tylenol or ibuprofen to help with the pain. And if you're still not better in three to four days, please let us know or your primary care physician. If you're getting worse between now and then, such as a higher fever, vomiting, you can't swallow your own saliva, can't breathe good, those are things we want you to come back and immediately for. Okay."
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
      const dir = `./performance/${new Date().toJSON().slice(0,10)}/${name}`;
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir, { recursive: true });
      }
      // enable when we want/need the JSON
      // fs.writeFileSync(`${dir}/${noteWindowId}.json`, JSON.stringify({
      //   runId,
      //   noteWindowId,
      //   start,
      //   predictions,
      // }));

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

      // Heading
      str += `${name}\n`
      str += `---\n`;
      str += '#### Transcript\n';
      str += `\`\`\`\n`;
      str += `${text}\n`;
      str += `\`\`\`\n\n`;

      // CC
      str += `#### CC \n`;
      str += `${get(vfMap, 'cc[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'} \n\n`;

      // HPI
      str += `#### HPI \n`;
      str += `${get(vfMap, 'hpi[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // ROS
      str += `#### ROS \n`;
      vfMap.ros.forEach((s) => {
        const isAsserted = s.findingAttributes.find((a) => a.findingAttributeKey === 'isAsserted') || {};
        const code = s.findingAttributes.find((a) => a.findingAttributeKey === 'code') || {};
        const bodySystem = s.findingAttributes.find((a) => a.findingAttributeKey === 'bodySystem') || {};
        str += `- ${get(bodySystem, 'findingAttributeValue', 'Unknown')}: [${get(isAsserted, 'findingAttributeValue', 'Unknown')}] ${get(code, 'findingAttributeDescription', 'Unknown')} \n`
      });
      str += `\n`;

      // PMH
      str += `#### Past Medical History \n`;
      let pmh = get(vfMap, 'pmh[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE';
      pmh = pmh.split('\n');
      pmh = pmh.join('\n- ');
      str += `- ${pmh}`;
      str += `\n\n`;

      // FHX
      str += `#### Family History \n`;
      str += `${get(vfMap, 'family[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // SHX
      str += `#### Social History \n`;
      str += `${get(vfMap, 'social[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE'}`;
      str += `\n\n`;

      // Allergies
      str += `#### Allergies \n`;
      let allergies = get(vfMap, 'allergies[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE';
      allergies = allergies.split('\n');
      allergies = allergies.join('\n- ');
      str += `- ${allergies}`;
      str += `\n\n`;

      // Medications
      str += `#### Medications \n`;
      let rx = get(vfMap, 'rx[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE';
      rx = rx.split('\n');
      rx = rx.join('\n- ');
      str += `- ${rx}`;
      str += `\n\n`;

      // Assessment & Plan
      str += `#### Assessment & Plan \n`;
      let problems = get(vfMap, 'problems[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE';
      problems = problems.split('\n');
      problems = problems.join('\n- ');
      str += `- ${problems}`;
      str += `\n\n`;

      console.log(str); // eslint-disable-line
      fs.writeFileSync(`${dir}/${runId}.md`, str);

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
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.breathing,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.soreThroat,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.urgentCare,
    }),
  ];
  const done$ = concat(...tests);
  done$.subscribe((d) => console.log('DONE!'));  // eslint-disable-line

  return done$;
};

performanceTest();

module.exports = performanceTest;
