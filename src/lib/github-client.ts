// GitHub API Client - 封装 GitHub REST API 操作

const GITHUB_API = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  return token;
}

function getOrg(): string {
  return process.env.GITHUB_ORG || "";
}

async function githubRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const token = getToken();
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${GITHUB_API}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

export interface CreateRepoFromTemplateOptions {
  templateOwner: string;
  templateRepo: string;
  repoName: string;
  description?: string;
  private?: boolean;
  owner?: string;
}

/**
 * 从模板仓库创建新仓库
 */
export async function createRepoFromTemplate(
  options: CreateRepoFromTemplateOptions
) {
  const owner = options.owner || getOrg();
  return githubRequest(`/repos/${options.templateOwner}/${options.templateRepo}/generate`, {
    method: "POST",
    body: JSON.stringify({
      owner,
      name: options.repoName,
      description: options.description || "",
      private: options.private ?? true,
    }),
  });
}

/**
 * 创建或更新单个文件
 */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string = "main"
) {
  const contentB64 = Buffer.from(content).toString("base64");

  // 先检查文件是否存在，获取 SHA
  let sha: string | undefined;
  try {
    const existing = (await githubRequest(
      `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
    )) as { sha?: string };
    sha = existing?.sha;
  } catch {
    // 文件不存在，sha 保持 undefined
  }

  return githubRequest(`/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: contentB64,
      branch,
      sha,
    }),
  });
}

export interface FileEntry {
  path: string;
  content: string;
}

/**
 * 批量创建文件（逐个创建/更新）
 */
export async function createFiles(
  owner: string,
  repo: string,
  files: FileEntry[],
  message: string,
  branch: string = "main"
) {
  const results: unknown[] = [];
  for (const file of files) {
    const result = await createOrUpdateFile(
      owner,
      repo,
      file.path,
      file.content,
      `${message}: ${file.path}`,
      branch
    );
    results.push(result);
  }
  return results;
}

/**
 * 获取仓库目录内容列表
 */
export async function getRepoContents(
  owner: string,
  repo: string,
  path: string = "",
  branch: string = "main"
) {
  return githubRequest(
    `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  );
}

/**
 * 获取单个文件内容（返回解码后的文本）
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string = "main"
): Promise<string> {
  const result = (await githubRequest(
    `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  )) as { content: string; encoding: string };

  if (result.encoding === "base64") {
    return Buffer.from(result.content, "base64").toString("utf-8");
  }
  return result.content;
}
