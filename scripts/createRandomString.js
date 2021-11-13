const randomstring = require('randomstring');

const {Command} = require('commander');

const program = new Command();

const createStr = ({length = 13, charset = 'alphanumeric'}) => {
  const str = randomstring.generate({length, charset});
  console.log(str);
  return str;
}

// node ./bin/code-generators/generateScaffold --help
program
  .command('randomstring')
  .description('create a randomstring')
  .option('-l,--length', 'number of characters', 13)
  .option('-c,--charset', 'characters that can be used (alphanumeric, alphabetic, numeric, hex)', 'alphanumeric')
  // .option('-w --without', 'model, create, remove, delete, update')
  // .option('-f --force', 'overwrite existing files')
  .action(options => createStr(options));

program.parse(process.argv);
