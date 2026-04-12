import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(__filename);

const dbPath = path.join(_dirname, '../attendance.db');
const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  err => {
    if (err) console.error('Database connection failed:', err);
    else console.log('Connected to SQLite database');
  },
);

db.serialize(() => {
 db.run(`
        CREATE TABLE IF NOT EXISTS users (
            name TEXT,
            username TEXT UNIQUE PRIMARY KEY,
            password TEXT DEFAULT 'password',
            role TEXT NOT NULL,
            section TEXT DEFAULT NULL,
            subjectName TEXT DEFAULT NULL
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId TEXT NOT NULL,
            courseId TEXT NOT NULL,
            sessionId TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            removed INTEGER DEFAULT 0
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            sessionId TEXT PRIMARY KEY,
            courseId TEXT,
            teacherId TEXT,
            startTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            endTime DATETIME,
            status TEXT DEFAULT 'active'
        );
    `);
    //Course Table
    db.run(`
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            abbr TEXT UNIQUE           
        ); 
    `);
    //Branches Table
    db.run(`
        CREATE TABLE IF NOT EXISTS branches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              course_id INTEGER,
              name TEXT NOT NULL,
              abbr TEXT UNIQUE,
              FOREIGN KEY (course_id) REFERENCES courses(id)
        );
    `);
    //Classes Table
    db.run(`
        CREATE TABLE IF NOT EXISTS classes (
            course_id INTEGER PRIMARY KEY,
            branch_id INTEGER PRIMARY KEY,
            semester INTEGER PRIMARY KEY,
            section_id INTEGER PRIMARY KEY,
            FOREIGN KEY (course_id) REFERENCES courses(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (section_id) REFERENCES sections(id)
         );
    `);
    //Sections Table
    db.run(`
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY,
            section_name TEXT NOT NULL,
            label TEXT
         );
    `);
    //  NEW STUDENT TABLE
    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER,
            name TEXT NOT NULL,
            roll_number TEXT,
            PRIMARY KEY (id, roll_number)
        );
    `);
    //  SUBJECT MAPPING TABLE
    db.run(`
        CREATE TABLE IF NOT EXISTS subject_mapping (
            subject_code TEXT PRIMARY KEY,
            abbr TEXT,
            name TEXT NOT NULL,
            branch_id INTEGER,
            course_id INTEGER,
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (course_id) REFERENCES courses(id)
        );
    `);
    //  FACULTY TABLE
    db.run(`
        CREATE TABLE IF NOT EXISTS faculty (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            roll_number TEXT,
            course_id INTEGER,
            branch_id INTEGER,
            subject_id TEXT,
            FOREIGN KEY (course_id) REFERENCES courses(id),
            FOREIGN KEY (branch_id) REFERENCES branches(id),
            FOREIGN KEY (subject_id) REFERENCES subject_mapping(subject_code)
        );
    `);
});

export default db;