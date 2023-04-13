const get = require('lodash/get');
const fs = require('fs');
const {concat} = require('rxjs');
const {map} = require('rxjs/operators');

const toPredictions = require('../operators/toPredictions');
const transcripts = require('./transcripts.js');

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY must be set!');  // eslint-disable-line
  process.exit(1);
}

const TRANSCRIPTS = transcripts;

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
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.backpain,
    }),
    handleMessage()({
      index: 0,
      ...TRANSCRIPTS.allergy,
    }),
  ];
  const done$ = concat(...tests);
  done$.subscribe((d) => console.log('DONE!'));  // eslint-disable-line

  return done$;
};

performanceTest();

module.exports = performanceTest;