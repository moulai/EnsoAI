import { execSync } from 'node:child_process';
import { streamText } from 'ai';
import { type AIProvider, getModel, type ModelId, type ReasoningEffort } from './providers';

export interface CodeReviewOptions {
  workdir: string;
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  language: string;
  reviewId: string;
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

const activeReviews = new Map<string, AbortController>();

function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function getDefaultBranch(workdir: string): string {
  // Try to get the default branch from remote HEAD reference
  const ref = runGit('git symbolic-ref refs/remotes/origin/HEAD', workdir);
  if (ref) {
    // Extract branch name from "refs/remotes/origin/main" -> "main"
    const match = ref.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) {
      return match[1];
    }
  }
  return 'main';
}

function buildPrompt(gitDiff: string, gitLog: string, language: string): string {
  return `Always reply in ${language}. You are performing a code review on the changes in the current branch.


## Code Review Instructions

The entire git diff for this branch has been provided below, as well as a list of all commits made to this branch.

**CRITICAL: EVERYTHING YOU NEED IS ALREADY PROVIDED BELOW.** The complete git diff and full commit history are included in this message.

**DO NOT run git diff, git log, git status, or ANY other git commands.** All the information you need to perform this review is already here.

When reviewing the diff:
1. **Focus on logic and correctness** - Check for bugs, edge cases, and potential issues.
2. **Consider readability** - Is the code clear and maintainable? Does it follow best practices in this repository?
3. **Evaluate performance** - Are there obvious performance concerns or optimizations that could be made?
4. **Assess test coverage** - Does the repository have testing patterns? If so, are there adequate tests for these changes?
5. **Ask clarifying questions** - Ask the user for clarification if you are unsure about the changes or need more context.
6. **Don't be overly pedantic** - Nitpicks are fine, but only if they are relevant issues within reason.

In your output:
- Provide a summary overview of the general code quality.
- Present the identified issues in a table with the columns: index (1, 2, etc.), line number(s), code, issue, and potential solution(s).
- If no issues are found, briefly state that the code meets best practices.

## Full Diff

**REMINDER: Output directly, DO NOT output, provide feedback, or ask questions via tools, DO NOT use any tools to fetch git information.** Simply read the diff and commit history that follow.

${gitDiff || '(No diff available)'}

## Commit History

${gitLog || '(No commit history available)'}`;
}

export async function startCodeReview(options: CodeReviewOptions): Promise<void> {
  const {
    workdir,
    provider,
    model,
    reasoningEffort,
    language,
    reviewId,
    onChunk,
    onComplete,
    onError,
  } = options;

  const gitDiff = runGit('git --no-pager diff HEAD', workdir);
  const defaultBranch = getDefaultBranch(workdir);
  // Try to get commits since diverging from default branch, fallback to recent commits
  let gitLog = runGit(`git --no-pager log origin/${defaultBranch}..HEAD --oneline`, workdir);
  if (!gitLog) {
    gitLog = runGit('git --no-pager log -10 --oneline', workdir);
  }

  if (!gitDiff && !gitLog) {
    onError('No changes to review');
    return;
  }

  const controller = new AbortController();
  activeReviews.set(reviewId, controller);

  try {
    console.log(
      `[code-review] Starting review with provider=${provider}, model=${model}, cwd=${workdir}`
    );
    const modelInstance = getModel(model, { provider, reasoningEffort, cwd: workdir });
    console.log(`[code-review] Model instance created`);

    const prompt = buildPrompt(gitDiff, gitLog, language);
    console.log(`[code-review] Prompt length: ${prompt.length} chars`);

    const result = streamText({
      model: modelInstance,
      prompt,
      abortSignal: controller.signal,
    });

    for await (const chunk of result.textStream) {
      onChunk(chunk);
    }
    onComplete();
  } catch (err) {
    console.error(`[code-review] Error:`, err);
    if (err instanceof Error) {
      console.error(`[code-review] Error name: ${err.name}, message: ${err.message}`);
      console.error(`[code-review] Error stack:`, err.stack);
      if ('cause' in err && err.cause) {
        console.error(`[code-review] Error cause:`, err.cause);
      }
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    onError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    activeReviews.delete(reviewId);
  }
}

export function stopCodeReview(reviewId: string): void {
  const controller = activeReviews.get(reviewId);
  if (controller) {
    controller.abort();
    activeReviews.delete(reviewId);
  }
}
