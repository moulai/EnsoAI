import { execSync } from 'node:child_process';
import { generateText } from 'ai';
import { type AIProvider, getModel, type ModelId, type ReasoningEffort } from './providers';

export interface CommitMessageOptions {
  workdir: string;
  maxDiffLines: number;
  timeout: number;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
}

export interface CommitMessageResult {
  success: boolean;
  message?: string;
  error?: string;
}

function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

export async function generateCommitMessage(
  options: CommitMessageOptions
): Promise<CommitMessageResult> {
  const { workdir, maxDiffLines, timeout, provider, model, reasoningEffort } = options;

  const recentCommits = runGit('git --no-pager log -5 --format="%s"', workdir);
  const stagedStat = runGit('git --no-pager diff --cached --stat', workdir);
  const stagedDiff = runGit('git --no-pager diff --cached', workdir);

  const truncatedDiff =
    stagedDiff.split('\n').slice(0, maxDiffLines).join('\n') || '(no staged changes detected)';

  const prompt = `你无法调用任何工具，我消息里已经包含了所有你需要的信息，无需解释，直接返回一句简短的 commit message。

参考风格：
${recentCommits || '(no recent commits)'}

变更摘要：
${stagedStat || '(no stats)'}

变更详情：
${truncatedDiff}`;

  try {
    console.log(`[commit-msg] Starting with provider=${provider}, model=${model}, cwd=${workdir}`);
    const modelInstance = getModel(model, { provider, reasoningEffort, cwd: workdir });
    console.log(`[commit-msg] Model instance created, prompt length: ${prompt.length}`);

    const { text } = await generateText({
      model: modelInstance,
      prompt,
      abortSignal: AbortSignal.timeout(timeout * 1000),
    });
    console.log(`[commit-msg] Success, response length: ${text.length}`);
    return { success: true, message: text.trim() };
  } catch (err) {
    console.error(`[commit-msg] Error:`, err);
    if (err instanceof Error) {
      console.error(`[commit-msg] Error name: ${err.name}, message: ${err.message}`);
      console.error(`[commit-msg] Error stack:`, err.stack);
      if ('cause' in err && err.cause) {
        console.error(`[commit-msg] Error cause:`, err.cause);
      }
    }
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}
