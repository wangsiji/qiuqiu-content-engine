// 一键全站构建入口：node build_all.mjs（可在仓库任意目录执行）
// 内部只有一步：node build.mjs —— 一个脚本生成全站（取代旧的 9 脚本链）。
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
execSync('node build.mjs', { stdio: 'inherit', cwd: here });