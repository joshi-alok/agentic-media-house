import type { Exec } from '../../src/run/forge';

// A stand-in for running a program, for the tests of the code that runs `git` and `gh`. It answers each call with the reply that the test scripted for
// it, in order, and keeps every call, so that a test can say exactly which program was run with which arguments. No program is ever started.

/** One call of the program: what was run, with which arguments, in which folder. */
export interface ExecCall {
  file: string;
  args: string[];
  cwd: string | undefined;
}

/** What a call answers: the exit code and what the program printed, or a failure to start it at all (an `Error`), or a function that makes either from the call. */
export type ExecReply = { code: number; stdout?: string; stderr?: string } | Error;
export type ScriptedReply = ExecReply | ((call: ExecCall) => ExecReply | Promise<ExecReply>);

/** The `Exec` that gives `replies` in order, and the list of the calls it has had. A call with no reply left throws, and says which call it was. */
export function scriptedExec(...replies: ScriptedReply[]): { exec: Exec; calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  let next = 0;
  const exec: Exec = async (file, args, options) => {
    const call: ExecCall = { file, args: [...args], cwd: options.cwd };
    calls.push(call);
    const scripted = replies[next++];
    if (scripted === undefined) throw new Error(`scriptedExec: there is no reply for call ${next}: ${file} ${args.join(' ')}`);
    const reply = typeof scripted === 'function' ? await scripted(call) : scripted;
    if (reply instanceof Error) throw reply;
    return { stdout: reply.stdout ?? '', stderr: reply.stderr ?? '', code: reply.code };
  };
  return { exec, calls };
}
