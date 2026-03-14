import type { WorkflowRunSummary } from "../types";

const GITHUB_API_BASE = "https://api.github.com";

async function githubRequest<T>(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API 오류 (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function dispatchWorkflowRun(params: {
  owner: string;
  repo: string;
  workflowFile: string;
  branch: string;
  token: string;
}) {
  await githubRequest(
    `/repos/${params.owner}/${params.repo}/actions/workflows/${params.workflowFile}/dispatches`,
    params.token,
    {
      method: "POST",
      body: JSON.stringify({
        ref: params.branch,
        inputs: {
          triggered_by: "dashboard"
        }
      })
    }
  );
}

export async function findLatestWorkflowRun(params: {
  owner: string;
  repo: string;
  workflowFile: string;
  branch: string;
  token: string;
}): Promise<WorkflowRunSummary | null> {
  const response = await githubRequest<{
    workflow_runs: Array<{
      id: number;
      html_url: string;
      status: string | null;
      conclusion: string | null;
    }>;
  }>(
    `/repos/${params.owner}/${params.repo}/actions/workflows/${params.workflowFile}/runs?branch=${params.branch}&event=workflow_dispatch&per_page=10`,
    params.token
  );

  const latestRun = response.workflow_runs[0];
  if (!latestRun) {
    return null;
  }

  return {
    id: latestRun.id,
    htmlUrl: latestRun.html_url,
    status: latestRun.status,
    conclusion: latestRun.conclusion
  };
}

export async function getWorkflowRun(params: {
  owner: string;
  repo: string;
  runId: number;
  token: string;
}) {
  const response = await githubRequest<{
    id: number;
    html_url: string;
    status: string | null;
    conclusion: string | null;
  }>(`/repos/${params.owner}/${params.repo}/actions/runs/${params.runId}`, params.token);

  return {
    id: response.id,
    htmlUrl: response.html_url,
    status: response.status,
    conclusion: response.conclusion
  } satisfies WorkflowRunSummary;
}
