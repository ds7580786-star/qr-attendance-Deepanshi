import express from 'express';
import db from '../utils/db.js';

const router = express.Router();

// Get Counts
router.get('/stats', (req, res) => {

  const stats = {
    students: 0,
    faculty: 0,
    liveSessions: 0,
    attendance: 0,
  };

  db.get(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE role = 'student'`,
    (err, studentRow) => {

      if (err) {
        return res.status(500).json({
          ok: false,
          error: err.message
        });
      }

      stats.students = studentRow.count;

      db.get(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE role = 'faculty'`,
        (err, facultyRow) => {

          if (err) {
            return res.status(500).json({
              ok: false,
              error: err.message
            });
          }

          stats.faculty = facultyRow.count;

          db.get(
            `SELECT COUNT(*) AS count
             FROM sessions
             WHERE status = 'active'`,
            (err, sessionRow) => {

              if (err) {
                return res.status(500).json({
                  ok: false,
                  error: err.message
                });
              }

              stats.liveSessions = sessionRow.count;

              db.get(
                `SELECT COUNT(*) AS count
                 FROM attendance`,
                (err, attendanceRow) => {

                  if (err) {
                    return res.status(500).json({
                      ok: false,
                      error: err.message
                    });
                  }

                  stats.attendance = attendanceRow.count;

                  return res.json({
                    ok: true,
                    stats
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

// Get Students
router.get('/students', (req, res) => {
  db.all(
    `SELECT name, username, section
     FROM users
     WHERE role = 'student'
     ORDER BY name ASC`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }

      return res.json({
        ok: true,
        students: rows,
      });
    }
  );
});


// Add Student
router.post('/add-student', (req, res) => {
  const { name, username, password, section } = req.body;

  if (!name || !username || !password || !section) {
    return res.status(400).json({
      ok: false,
      error: 'All student fields are required',
    });
  }

  db.run(
    `INSERT INTO users (name, username, password, role, section)
     VALUES (?, ?, ?, 'student', ?)`,
    [name, username, password, section],
    function (err) {
      if (err) {
        return res.status(500).json({
          ok: false,
          error: err.message,
        });
      }

      return res.json({
        ok: true,
        message: 'Student added successfully',
      });
    }
  );
});

// ==================== FACULTY ====================

// GET all faculty
router.get('/faculty', (req, res) => {

  const sql = `
    SELECT
      f.id,
      u.id AS user_id,
      u.name,
      u.username,
      s.id AS subject_id,
      s.subject_code,
      s.name AS subject_name,
      s.abbr AS subject_abbr
    FROM faculty f
    JOIN users u ON f.user_id = u.id
    JOIN subjects s ON f.subject_id = s.id
    ORDER BY u.name ASC
  `;

  db.all(sql, [], (err, rows) => {

    if (err) {
      console.error('Error fetching faculty:', err);

      return res.status(500).json({
        ok: false,
        error: err.message
      });
    }

    res.json({
      ok: true,
      faculty: rows
    });
  });
});


// ADD faculty
router.post('/faculty', (req, res) => {

  const {
    name,
    username,
    password,
    subject_id
  } = req.body;

  if (!name || !username || !password || !subject_id) {
    return res.status(400).json({
      ok: false,
      error: 'Name, username, password and subject are required'
    });
  }

  // First create the user
  db.run(
    `INSERT INTO users
     (name, username, password, role)
     VALUES (?, ?, ?, 'faculty')`,
    [
      name.trim(),
      username.trim(),
      password
    ],
    function (err) {

      if (err) {
        console.error('Error adding faculty user:', err);

        return res.status(500).json({
          ok: false,
          error: err.message
        });
      }

      const userId = this.lastID;

      // Then create faculty record
      db.run(
        `INSERT INTO faculty
         (user_id, subject_id)
         VALUES (?, ?)`,
        [
          userId,
          Number(subject_id)
        ],
        function (err) {

          if (err) {

            console.error('Error adding faculty record:', err);

            // Remove user if faculty insertion failed
            db.run(
              `DELETE FROM users WHERE id = ?`,
              [userId]
            );

            return res.status(500).json({
              ok: false,
              error: err.message
            });
          }

          res.status(201).json({
            ok: true,
            message: 'Faculty added successfully',
            id: this.lastID
          });
        }
      );
    }
  );
});

// ==================== COURSE MAPPING ====================

// GET all courses
router.get('/courses', (req, res) => {

    db.all(
        `SELECT id, name, abbr
         FROM courses
         ORDER BY name`,
        [],
        (err, rows) => {

            if (err) {
                console.error("Error fetching courses:", err);

                return res.status(500).json({
                    ok: false,
                    error: "Failed to fetch courses"
                });
            }

            res.json(rows);
        }
    );
});


// ADD course
router.post('/courses', (req, res) => {

    const { name, abbr } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            ok: false,
            error: "Course name is required"
        });
    }

    db.run(
        `INSERT INTO courses (name, abbr)
         VALUES (?, ?)`,
        [
            name.trim(),
            abbr ? abbr.trim() : null
        ],
        function (err) {

            if (err) {
                console.error("Error adding course:", err);

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }

            res.status(201).json({
                ok: true,
                message: "Course added successfully",
                id: this.lastID
            });
        }
    );
});


// UPDATE course
router.put('/courses/:id', (req, res) => {

    const { name, abbr } = req.body;
    const id = req.params.id;

    if (!name || !name.trim()) {
        return res.status(400).json({
            ok: false,
            error: "Course name is required"
        });
    }

    db.run(
        `UPDATE courses
         SET name = ?, abbr = ?
         WHERE id = ?`,
        [
            name.trim(),
            abbr ? abbr.trim() : null,
            id
        ],
        function (err) {

            if (err) {
                console.error("Error updating course:", err);

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    ok: false,
                    error: "Course not found"
                });
            }

            res.json({
                ok: true,
                message: "Course updated successfully"
            });
        }
    );
});


// DELETE course
router.delete('/courses/:id', (req, res) => {

    const id = req.params.id;

    // Check whether course is being used
    db.get(
        `SELECT COUNT(*) AS count
         FROM curriculum
         WHERE course_id = ?`,
        [id],
        (err, row) => {

            if (err) {
                console.error("Error checking course usage:", err);

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }

            if (row.count > 0) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Cannot delete this course because it is being used by curriculum."
                });
            }

            db.run(
                `DELETE FROM courses
                 WHERE id = ?`,
                [id],
                function (err) {

                    if (err) {
                        console.error("Error deleting course:", err);

                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            ok: false,
                            error: "Course not found"
                        });
                    }

                    res.json({
                        ok: true,
                        message: "Course deleted successfully"
                    });
                }
            );
        }
    );
});

// ==================== SUBJECT MAPPING ====================

// GET all subjects
router.get('/subjects', (req, res) => {
    const sql = `
        SELECT
            s.id,
            s.subject_code,
            s.name,
            s.abbr,
            cu.semester,
            c.name AS course_name,
            b.name AS branch_name
        FROM subjects s
        JOIN curriculum cu ON s.curriculum_id = cu.id
        JOIN courses c ON cu.course_id = c.id
        JOIN branches b ON cu.branch_id = b.id
        ORDER BY s.name
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error fetching subjects:", err);
            return res.status(500).json({
                error: "Failed to fetch subjects"
            });
        }

        res.json({
          ok:true,
          subjects:rows
        })
    });
});


// ADD subject
router.post('/subjects', (req, res) => {

    const {
        subject_code,
        abbr,
        name,
        course_id,
        branch_id,
        semester
    } = req.body;

    if (!subject_code || !name || !course_id || !branch_id || !semester) {
        return res.status(400).json({
            ok: false,
            error: "All required fields are missing"
        });
    }

    // Find curriculum
    db.get(
        `SELECT id FROM curriculum
         WHERE course_id = ?
         AND branch_id = ?
         AND semester = ?`,
        [course_id, branch_id, semester],
        (err, curriculum) => {

            if (err) {
                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }

            if (!curriculum) {
                return res.status(404).json({
                    ok: false,
                    error: "Curriculum not found"
                });
            }

            // Add subject
            db.run(
                `INSERT INTO subjects
                (subject_code, name, abbr, curriculum_id)
                VALUES (?, ?, ?, ?)`,
                [
                    subject_code.trim(),
                    name.trim(),
                    abbr ? abbr.trim() : null,
                    curriculum.id
                ],
                function (err) {

                    if (err) {
                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }

                    res.status(201).json({
                        ok: true,
                        message: "Subject added successfully",
                        id: this.lastID
                    });
                }
            );
        }
    );
});


// UPDATE subject
router.put('/subjects/:id', (req, res) => {

    const id = req.params.id;

    const {
        subject_code,
        abbr,
        name,
        branch_id,
        course_id,
        semester
    } = req.body;

    if (
        !subject_code ||
        !name ||
        !branch_id ||
        !course_id ||
        !semester
    ) {
        return res.status(400).json({
            ok: false,
            error:
                "Subject code, name, course, branch and semester are required"
        });
    }

    // Find the curriculum for this course + branch + semester
    db.get(
        `SELECT id
         FROM curriculum
         WHERE course_id = ?
         AND branch_id = ?
         AND semester = ?`,
        [
            Number(course_id),
            Number(branch_id),
            Number(semester)
        ],
        (err, curriculum) => {

            if (err) {
                console.error("Error finding curriculum:", err);

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }

            if (!curriculum) {
                return res.status(404).json({
                    ok: false,
                    error: "Curriculum not found"
                });
            }

            db.run(
                `UPDATE subjects
                 SET
                    subject_code = ?,
                    abbr = ?,
                    name = ?,
                    curriculum_id = ?
                 WHERE id = ?`,
                [
                    subject_code.trim(),
                    abbr ? abbr.trim() : null,
                    name.trim(),
                    curriculum.id,
                    id
                ],
                function (err) {

                    if (err) {
                        console.error(
                            "Error updating subject:",
                            err
                        );

                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            ok: false,
                            error: "Subject not found"
                        });
                    }

                    res.json({
                        ok: true,
                        message: "Subject updated successfully"
                    });
                }
            );
        }
    );
});


// DELETE subject
router.delete('/subjects/:id', (req, res) => {

    const id = req.params.id;

    // Check whether subject is assigned to faculty
    db.get(
        `SELECT COUNT(*) AS count
         FROM faculty
         WHERE subject_id = ?`,
        [id],
        (err, row) => {

            if (err) {
                console.error(
                    "Error checking subject usage:",
                    err
                );

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }

            if (row.count > 0) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Cannot delete subject because it is assigned to faculty"
                });
            }

            db.run(
                `DELETE FROM subjects
                 WHERE id = ?`,
                [id],
                function (err) {

                    if (err) {
                        console.error(
                            "Error deleting subject:",
                            err
                        );

                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            ok: false,
                            error: "Subject not found"
                        });
                    }

                    res.json({
                        ok: true,
                        message: "Subject deleted successfully"
                    });
                }
            );
        }
    );
});

// ============================================================
// BRANCH MAPPING
// ============================================================


// ==================== GET ALL BRANCHES ====================

router.get('/branches', (req, res) => {

    const { course_id } = req.query;

    let sql = `
        SELECT
            b.id,
            b.course_id,
            b.name,
            b.abbr,
            c.name AS course_name
        FROM branches b
        JOIN courses c ON b.course_id = c.id
    `;

    const params = [];


    // If course_id is provided,
    // return only branches of that course

    if (course_id) {
        sql += ` WHERE b.course_id = ?`;
        params.push(course_id);
    }


    sql += `
        ORDER BY c.name, b.name
    `;


    db.all(sql, params, (err, rows) => {

        if (err) {

            console.error(
                'Error fetching branches:',
                err
            );

            return res.status(500).json({
                ok: false,
                error: err.message
            });
        }


        res.json(rows);
    });
});


// ==================== ADD BRANCH ====================

router.post('/branches', (req, res) => {

    const {
        course_id,
        name,
        abbr
    } = req.body;


    if (!course_id || !name || !name.trim()) {

        return res.status(400).json({
            ok: false,
            error: 'Course and branch name are required'
        });
    }


    // Make sure the course exists

    db.get(
        `SELECT id FROM courses WHERE id = ?`,
        [course_id],
        (err, course) => {

            if (err) {

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }


            if (!course) {

                return res.status(404).json({
                    ok: false,
                    error: 'Course not found'
                });
            }


            // Add branch

            db.run(
                `INSERT INTO branches
                 (course_id, name, abbr)
                 VALUES (?, ?, ?)`,
                [
                    Number(course_id),
                    name.trim(),
                    abbr ? abbr.trim() : null
                ],
                function (err) {

                    if (err) {

                        console.error(
                            'Error adding branch:',
                            err
                        );

                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }


                    res.status(201).json({
                        ok: true,
                        message: 'Branch added successfully',
                        id: this.lastID
                    });
                }
            );
        }
    );
});


// ==================== UPDATE BRANCH ====================

router.put('/branches/:id', (req, res) => {

    const id = req.params.id;

    const {
        course_id,
        name,
        abbr
    } = req.body;


    if (!course_id || !name || !name.trim()) {

        return res.status(400).json({
            ok: false,
            error: 'Course and branch name are required'
        });
    }


    // Make sure the course exists

    db.get(
        `SELECT id FROM courses WHERE id = ?`,
        [course_id],
        (err, course) => {

            if (err) {

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }


            if (!course) {

                return res.status(404).json({
                    ok: false,
                    error: 'Course not found'
                });
            }


            db.run(
                `UPDATE branches
                 SET course_id = ?,
                     name = ?,
                     abbr = ?
                 WHERE id = ?`,
                [
                    Number(course_id),
                    name.trim(),
                    abbr ? abbr.trim() : null,
                    id
                ],
                function (err) {

                    if (err) {

                        console.error(
                            'Error updating branch:',
                            err
                        );

                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }


                    if (this.changes === 0) {

                        return res.status(404).json({
                            ok: false,
                            error: 'Branch not found'
                        });
                    }


                    res.json({
                        ok: true,
                        message: 'Branch updated successfully'
                    });
                }
            );
        }
    );
});


// ==================== DELETE BRANCH ====================

router.delete('/branches/:id', (req, res) => {

    const id = req.params.id;


    // Check whether branch is being used
    // by curriculum

    db.get(
        `SELECT COUNT(*) AS count
         FROM curriculum
         WHERE branch_id = ?`,
        [id],
        (err, row) => {

            if (err) {

                console.error(
                    'Error checking branch usage:',
                    err
                );

                return res.status(500).json({
                    ok: false,
                    error: err.message
                });
            }


            if (row.count > 0) {

                return res.status(400).json({
                    ok: false,
                    error:
                        'Cannot delete this branch because it is being used by curriculum.'
                });
            }


            db.run(
                `DELETE FROM branches
                 WHERE id = ?`,
                [id],
                function (err) {

                    if (err) {

                        console.error(
                            'Error deleting branch:',
                            err
                        );

                        return res.status(500).json({
                            ok: false,
                            error: err.message
                        });
                    }


                    if (this.changes === 0) {

                        return res.status(404).json({
                            ok: false,
                            error: 'Branch not found'
                        });
                    }


                    res.json({
                        ok: true,
                        message: 'Branch deleted successfully'
                    });
                }
            );
        }
    );
});

export default router;