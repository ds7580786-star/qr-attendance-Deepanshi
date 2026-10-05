CREATE TABLE "attendance" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT CHECK(status IN ('present','absent')) DEFAULT 'absent',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  `camera_fingerprint` TEXT,
  UNIQUE (session_id, student_id)
);

CREATE TABLE branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  abbr TEXT NOT NULL
);

CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  semester INTEGER,
  section_id INTEGER NOT NULL REFERENCES sections(id),
  `room_id` INTEGER REFERENCES `rooms`(`id`),
  UNIQUE (course_id, branch_id, semester, section_id)
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  abbr TEXT NOT NULL UNIQUE
);

CREATE TABLE curriculum (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  semester INTEGER,
  UNIQUE (course_id, branch_id, semester)
);

CREATE TABLE face_descriptors (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  descriptor TEXT NOT NULL
);

CREATE TABLE "faculty" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  UNIQUE (user_id, subject_id)
);

CREATE TABLE "rooms" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_title TEXT,
  room_number TEXT NOT NULL,
  block TEXT NOT NULL,
  UNIQUE (room_number, block)
);

CREATE TABLE sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  label TEXT
);

CREATE TABLE "sessions" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_code INTEGER NOT NULL,
  timetable_id INTEGER NOT NULL REFERENCES timetable(id),
  date DATE NOT NULL,
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME
);

CREATE TABLE slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE "students" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  roll_number TEXT UNIQUE,
  class_id INTEGER NOT NULL REFERENCES classes(id)
);

CREATE TABLE "subjects" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_code TEXT NOT NULL,
  name TEXT NOT NULL,
  abbr TEXT,
  curriculum_id INTEGER NOT NULL REFERENCES curriculum(id)
);

CREATE TABLE "timetable" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT CHECK(day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')) NOT NULL,
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  faculty_id INTEGER NOT NULL REFERENCES faculty(id),
  room_id INTEGER REFERENCES rooms(id),
  UNIQUE (day, slot_id, room_id)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT 'password',
  role TEXT CHECK(role IN ('student','faculty','admin')) NOT NULL
);