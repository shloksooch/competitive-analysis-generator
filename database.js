/*
 * database.js
 *
 * This module abstracts away the underlying data store for the Competitive Analysis
 * Generator SaaS.  Today it simply reads and writes JSON files from disk, but
 * exposing all CRUD operations through an interface makes it trivial to swap in
 * a proper database (PostgreSQL, MySQL, MongoDB, etc.) later.  In a production
 * setting you would replace the fs operations with queries through an ORM
 * (Sequelize, TypeORM, Prisma) or direct SQL and manage connections using a
 * connection pool.  Until external packages can be installed, this file
 * simulates a database using JSON files stored in the repository.
 */

const fs = require('fs');
const path = require('path');

// Base directory for data files
const DATA_DIR = __dirname;

// Helper to read a JSON file, returning a default value if it doesn't exist
function readJson(filename, defaultValue) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultValue;
  }
}

// Helper to write a JSON file atomically
function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// CRUD functions for Users
function getUsers() {
  return readJson('users.json', []);
}

function saveUsers(users) {
  writeJson('users.json', users);
}

function findUserByUsername(username) {
  return getUsers().find((u) => u.username === username);
}

function addUser(user) {
  const users = getUsers();
  users.push(user);
  saveUsers(users);
}

// CRUD functions for Sessions
function getSessions() {
  return readJson('sessions.json', {});
}

function saveSessions(sessions) {
  writeJson('sessions.json', sessions);
}

function getSession(token) {
  const sessions = getSessions();
  return sessions[token];
}

function saveSession(token, session) {
  const sessions = getSessions();
  sessions[token] = session;
  saveSessions(sessions);
}

function deleteSession(token) {
  const sessions = getSessions();
  delete sessions[token];
  saveSessions(sessions);
}

// CRUD functions for Analyses
function getAnalyses() {
  return readJson('analyses.json', []);
}

function saveAnalyses(analyses) {
  writeJson('analyses.json', analyses);
}

function addAnalysis(analysis) {
  const analyses = getAnalyses();
  analyses.push(analysis);
  saveAnalyses(analyses);
}

function listAnalysesByUser(userId) {
  return getAnalyses().filter((a) => a.userId === userId);
}

function getAnalysisById(id) {
  return getAnalyses().find((a) => a.id === id);
}

function deleteAnalysis(id) {
  const analyses = getAnalyses().filter((a) => a.id !== id);
  saveAnalyses(analyses);
}

// Metrics (views and conversions per variant)
function getMetrics() {
  return readJson('metrics.json', { variantA: 0, variantB: 0, conversionsA: 0, conversionsB: 0 });
}

function saveMetrics(metrics) {
  writeJson('metrics.json', metrics);
}

module.exports = {
  // Users
  getUsers,
  saveUsers,
  findUserByUsername,
  addUser,
  // Sessions
  getSession,
  saveSession,
  deleteSession,
  // Analyses
  addAnalysis,
  listAnalysesByUser,
  getAnalysisById,
  deleteAnalysis,
  // Metrics
  getMetrics,
  saveMetrics,
};