import { GhForge, GitCli, nodeExec } from './index';
import { main } from './cli';

// The program: `npm run desk -- run --dry --client fake --sources fixtures`. It runs `main` with the real clock, environment, git and forge (`git` and `gh`, which a
// piece that is held is sent to the owner with), in the folder it is started from, which must be the root of the repository, and sets the exit code.

const cwd = process.cwd();
process.exitCode = await main(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  env: process.env,
  cwd,
  now: () => new Date(),
  git: new GitCli(cwd),
  forge: new GhForge(nodeExec(), { cwd }),
});
