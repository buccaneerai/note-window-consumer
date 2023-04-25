const get = require('lodash/get');
const fs = require('fs');
const {concat,from,of} = require('rxjs');
const {map, catchError, mergeMap, tap} = require('rxjs/operators');
const {Configuration, OpenAIApi} = require('openai');


const toPredictions = require('../operators/toPredictions');
const transcripts = require('./transcripts.js');

const openAiConf = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(openAiConf);

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY must be set!');  // eslint-disable-line
  process.exit(1);
}

const TRANSCRIPTS = transcripts;

const toOpenAI = ({
  model = 'gpt-4',
  _openai = openai,
}) => ({truth, note}) => {
  return from(_openai.createChatCompletion({
    model,
    temperature: 0.7,
    top_p: 0.5,
    messages: [
        {"role": "system", "content": `
You are an assistant that grades and describes the differences between clinical medical notes created by a doctor.
The grading scale is from 0 to 10.  A score of "0" means that section is completely different and a score of "10" means that the section is 100% identical.
The format of the notes is Markdown.
`},
        {"role": "user", "content": `
The first note is: \n
${truth}
\n\n
The second note is: \n
${note}
\n\n
Grade and list the differences for each section of the note:`},
    ]
  })).pipe(
    map((response) => {
      const value = get(response, 'data.choices[0].message.content', '');
      return value;
    }),
    catchError((error) => {
      console.error(error); // eslint-disable-line
      return '';
    })
  );
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
      // str += `${name}\n`
      // str += `---\n`;
      // str += '#### Transcript\n';
      // str += `\`\`\`\n`;
      // str += `${text}\n`;
      // str += `\`\`\`\n\n`;

      // INTRO
      str += `#### INTRO \n`;
      str += `${get(vfMap, 'cc[0].findingAttributes[0].findingAttributeDescription', 'NONE') || 'NONE'} \n\n`;

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
      let family = get(vfMap, 'family[0].findingAttributes[0].stringValues[0]', 'NONE') || 'NONE';
      family = family.split('\n');
      family = family.join('\n- ');
      str += `- ${family}`;
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

      return str;
    }),
    mergeMap((note) => {
      let truth = '';
      const file = `./performance/ground-truth/${name}.md`;
      try   {
        if (fs.existsSync(file)) {
          truth = fs.readFileSync(file);
        }
      } catch(err) {
        console.error(err); // eslint-disable-line
      }
      if (truth && truth.toString) {
        return toOpenAI({})({truth: truth.toString(), note}).pipe(
          tap((diff) => {
            const dir = `./performance/${new Date().toJSON().slice(0,10)}/${name}`;
            if (!fs.existsSync(dir)){
                fs.mkdirSync(dir, { recursive: true });
            }
            console.log(diff); // eslint-disable-line
            fs.writeFileSync(`${dir}/diff.md`, diff);
          })
        );
      }
      return of({name, note});
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
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.backpain,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.allergy,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.openwound,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.cruise,
    }),
  ];
  const done$ = concat(...tests);
  done$.subscribe((d) => console.log('DONE!'));  // eslint-disable-line

  return done$;
};

performanceTest();

module.exports = performanceTest;
