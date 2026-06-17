import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_FILE = path.join(__dirname, '..', '..', 'posts-history.json');

function readPosts() {
  if (!fs.existsSync(POSTS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(POSTS_FILE, 'utf-8');
  return JSON.parse(data);
}

function writePosts(posts) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8');
}

export function savePost({ groupUrl, groupName, text, postUrl, screenshot }) {
  const posts = readPosts();
  const post = {
    id: Date.now().toString(),
    groupUrl,
    groupName: groupName || null,
    text,
    postUrl: postUrl || null,
    createdAt: new Date().toISOString(),
    hasScreenshot: !!screenshot,
  };
  posts.unshift(post);
  writePosts(posts);
  return post;
}

export function getAllPosts() {
  return readPosts();
}

export function getPostsByGroup(groupUrl) {
  return readPosts().filter((p) => p.groupUrl === groupUrl);
}
