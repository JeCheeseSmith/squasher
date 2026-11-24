import * as vscode from 'vscode';
import { getGitAPI, execGit, GitRepository } from './git';

const LIMIT = 100;

export class CommitNode extends vscode.TreeItem {
	constructor(
		public readonly repo: GitRepository,
		public readonly hash: string,
		short: string,
		subject: string,
		author: string,
		isHead: boolean
	) {
		super(subject, vscode.TreeItemCollapsibleState.None);
		this.description = isHead ? `${short} · ${author} · HEAD` : `${short} · ${author}`;
		this.tooltip = `${hash}\n${subject}`;
		this.iconPath = new vscode.ThemeIcon('git-commit');
		this.contextValue = 'squasherCommit';
	}
}

/** Lists the current branch's first-parent commits in a multi-select tree. */
export class CommitsProvider implements vscode.TreeDataProvider<CommitNode>, vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;
	private readonly watched = new Set<string>();
	private readonly disposables: vscode.Disposable[] = [this.emitter];

	refresh(): void {
		this.emitter.fire();
	}

	getTreeItem(element: CommitNode): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<CommitNode[]> {
		const api = await getGitAPI();
		if (!api || api.repositories.length === 0) {
			return [];
		}
		const nodes: CommitNode[] = [];
		for (const repo of api.repositories) {
			this.watch(repo);
			const res = await execGit(repo.rootUri.fsPath, [
				'log', '--first-parent', '-n', String(LIMIT), '--pretty=format:%H%x00%h%x00%s%x00%an',
			]);
			if (res.exitCode !== 0) {
				continue;
			}
			res.stdout.split('\n').filter(Boolean).forEach((line, i) => {
				const [hash, short, subject, author] = line.split('\0');
				nodes.push(new CommitNode(repo, hash, short, subject, author, i === 0));
			});
		}
		return nodes;
	}

	private watch(repo: GitRepository): void {
		const key = repo.rootUri.toString();
		if (this.watched.has(key)) {
			return;
		}
		this.watched.add(key);
		this.disposables.push(repo.state.onDidChange(() => this.refresh()));
	}

	dispose(): void {
		this.disposables.forEach((d) => d.dispose());
	}
}
