const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const { TOPIC_NAMES, NON_TOPIC_FEATURE_COUNT } = require('./topics_config');

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serves front.html statically

// 1. Initialize MySQL Connection Pool
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'Harshnew@gmail123',
    database: 'db_leetcode', // Fixed DB name alignment
    waitForConnections: true,
    connectionLimit: 10
});
// added all quesztion manually 
// POST /api/save-manual-setup
app.post('/api/save-manual-setup', async (req, res) => {
  const { uid, questions } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: 'Missing required parameter: uid' });
  }

  // Get a connection from the pool for a transaction
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. If user added manual questions, bulk insert them into user_problems / solved table
    if (Array.isArray(questions) && questions.length > 0) {
      const values = questions.map(qNum => [uid, qNum]);
      
      // Using INSERT IGNORE so duplicate entries won't crash the query
      await connection.query(
        'INSERT IGNORE INTO user_solved_history (uid, question_number) VALUES ?',
        [values]
      );

      // These are now solved, so clear any "found difficult" rows for them
      await connection.query(
        'DELETE FROM user_difficult_history WHERE uid = ? AND question_number IN (?)',
        [uid, questions]
      );

      await refreshUserProfileVector(connection, uid);

      // 2. Mark the user as synced in the users table
    const [userUpdate] = await connection.query(
      'UPDATE users SET synced = 1 WHERE uid = ?',
      [uid]
    );
    
    if (userUpdate.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    }

    

    

    // Commit transaction
    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Manual questions saved and user profile marked as synced.',
      addedCount: questions ? questions.length : 0,
      synced: 1
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error saving manual questions setup:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Database transaction failed while saving questions.' 
    });
  } finally {
    connection.release();
  }
});

// =====================================================================
// Decay settings for the user vector.
// HALF_LIFE_DAYS = how many days it takes for an old solve's influence
// on the profile vector to drop to half its original weight.
// Smaller number -> profile reacts faster to recent practice.
// Larger number -> profile stays close to a flat lifetime average.
// =====================================================================
const HALF_LIFE_DAYS = 30;
const DECAY_LAMBDA = Math.log(2) / HALF_LIFE_DAYS;

// Helper function: Recalculates user profile vector using a DECAYING
// weighted average (not a flat mean) and updates question_count.
// Recently solved problems influence the profile more than old ones,
// so the recommendation engine tracks where the user is skill-wise NOW.
async function refreshUserProfileVector(connection, uid) {
    // 1. Fetch question_vector and difficulty (no time decay needed)
    const [historyRows] = await connection.execute(`
        SELECT q.question_vector, q.difficulty
        FROM user_solved_history h
        JOIN questions q ON h.question_number = q.question_number
        WHERE h.uid = ?
    `, [uid]);

    if (historyRows.length === 0) return;

    // 2. Define static difficulty multiplier weights
    const DIFFICULTY_WEIGHTS = {
        'Easy': 1.0,
        'Medium': 1.5,
        'Hard': 2.2
    };

    const vectorLength = (typeof historyRows[0].question_vector === 'string'
        ? JSON.parse(historyRows[0].question_vector)
        : historyRows[0].question_vector).length;

    let weightedSum = new Array(vectorLength).fill(0);
    let totalWeight = 0;

    for (const row of historyRows) {
        const vector = typeof row.question_vector === 'string'
            ? JSON.parse(row.question_vector)
            : row.question_vector;

        // Determine weight based strictly on problem difficulty
        const weight = DIFFICULTY_WEIGHTS[row.difficulty] || 1.0;

        for (let i = 0; i < vectorLength; i++) {
            weightedSum[i] += vector[i] * weight;
        }
        totalWeight += weight;
    }

    // Normalize weighted vector sum
    const profileVector = totalWeight > 0
        ? weightedSum.map(v => v / totalWeight)
        : weightedSum;

    // 3. Save updated user vector and question count to DB
    await connection.execute(
        'UPDATE users SET question_count = ?, user_vector = ? WHERE uid = ?',
        [historyRows.length, JSON.stringify(profileVector), uid]
    );
}

// =====================================================================
// API 1: Manual Link Addition
// =====================================================================
// GET /api/is-synced/:uid
// GET /api/user/:uid — returns the LATEST user stats from the DB.
// The dashboard calls this on every page load so the solved count,
// difficult count, and vector status are always fresh, never stale
// localStorage data.
app.get('/api/user/:uid', async (req, res) => {
    const { uid } = req.params;
    try {
        const [userRows] = await pool.execute(
            'SELECT uid, username, question_count, user_vector, synced FROM users WHERE uid = ?',
            [uid]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        const user = userRows[0];

        const [difficultRows] = await pool.execute(
            'SELECT COUNT(*) AS count FROM user_difficult_history WHERE uid = ?',
            [uid]
        );

        return res.json({
            uid: user.uid,
            username: user.username,
            question_count: user.question_count || 0,
            has_vector: !!user.user_vector,
            synced: user.synced === 1,
            difficult_count: difficultRows[0].count
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/is-synced/:uid', async (req, res) => {
  const { uid } = req.params;

  try {
    // 1. Query the database for the user's synced column
    // (Adjust the query syntax below based on your DB library: mysql2, pg, sqlite3, knex, etc.)
    const [rows] = await pool.query('SELECT synced FROM users WHERE uid = ?', [uid]);

    // 2. If user doesn't exist, return not synced
    if (!rows || rows.length === 0) {
      return res.status(404).json({ is_synced: false, error: "User not found" });
    }

    // 3. Check if synced equals 1
    const isSynced = rows[0].synced === 1;

    return res.json({ is_synced: isSynced });

  } catch (err) {
    console.error("Error checking sync status:", err);
    return res.status(500).json({ is_synced: false, error: "Database query failed" });
  }
});
// =====================================================================
// API: Mark a question as "Found Difficult"
// Increments times_marked if it was already marked before, instead of
// creating duplicate rows. This question is NOT added to
// user_solved_history, so it still shows up as unsolved/recommendable,
// just with a priority boost (see /api/get-next below).
// =====================================================================
app.post('/api/mark-difficult', async (req, res) => {
    const { uid, question_number } = req.body;
    if (!uid || !question_number) {
        return res.status(400).json({ error: "Missing uid or question_number params" });
    }

    try {
        const [qExists] = await pool.execute(
            'SELECT question_number FROM questions WHERE question_number = ?',
            [question_number]
        );
        if (qExists.length === 0) {
            return res.status(404).json({ error: "Question metadata ID not found in database bank." });
        }

        // Don't let an already-solved question get marked difficult —
        // solved always wins, keeps the two tables mutually exclusive.
        const [alreadySolved] = await pool.execute(
            'SELECT 1 FROM user_solved_history WHERE uid = ? AND question_number = ?',
            [uid, question_number]
        );
        if (alreadySolved.length > 0) {
            return res.status(400).json({ error: "This question is already marked solved." });
        }

        await pool.execute(
            `INSERT INTO user_difficult_history (uid, question_number)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE times_marked = times_marked + 1, marked_at = CURRENT_TIMESTAMP`,
            [uid, question_number]
        );

        return res.json({ success: true, message: "Question marked as difficult." });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/unmark-solved — undoes a solved mark (removes it from
// user_solved_history and refreshes the profile vector). Used by the
// Virtual Contest page's toggle buttons, but safe to call anywhere.
app.post('/api/unmark-solved', async (req, res) => {
    const { uid, question_number } = req.body;
    if (!uid || !question_number) {
        return res.status(400).json({ error: "Missing uid or question_number params" });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            'DELETE FROM user_solved_history WHERE uid = ? AND question_number = ?',
            [uid, question_number]
        );
        await refreshUserProfileVector(connection, uid);
        await connection.commit();
        return res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// POST /api/unmark-difficult — undoes a "found difficult" mark
app.post('/api/unmark-difficult', async (req, res) => {
    const { uid, question_number } = req.body;
    if (!uid || !question_number) {
        return res.status(400).json({ error: "Missing uid or question_number params" });
    }

    try {
        await pool.execute(
            'DELETE FROM user_difficult_history WHERE uid = ? AND question_number = ?',
            [uid, question_number]
        );
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/add-solved', async (req, res) => {
    const { uid, question_number } = req.body;
    if (!uid || !question_number) {
        return res.status(400).json({ error: "Missing uid or question_number params" });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [qExists] = await connection.execute('SELECT question_number FROM questions WHERE question_number = ?', [question_number]);
        if (qExists.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: "Question metadata ID not found in database bank." });
        }

        await connection.execute('INSERT IGNORE INTO user_solved_history (uid, question_number) VALUES (?, ?)', [uid, question_number]);

        // A solved question should no longer count as "difficult" —
        // clear any prior difficult-history row for this (uid, question).
        await connection.execute(
            'DELETE FROM user_difficult_history WHERE uid = ? AND question_number = ?',
            [uid, question_number]
        );

        await refreshUserProfileVector(connection, uid);

        await connection.commit();
        return res.json({ success: true, message: "Problem database mapping updated." });
    } catch (err) {
        await connection.rollback();
        return res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// =====================================================================
// API 2: Sync Profile via Token Hook
// POST /api/mark-synced
app.post('/api/mark-synced', async (req, res) => {
  const { uid } = req.body;

  // 1. Validate request body
  if (!uid) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameter: uid' 
    });
  }

  try {
    // 2. Update user's synced status in MySQL database
    const [result] = await pool.query(
      'UPDATE users SET synced = 1 WHERE uid = ?',
      [uid]
    );

    // 3. Check if user existed in database
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // 4. Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'User synchronization status updated successfully.',
      uid: uid,
      synced: 1
    });

  } catch (err) {
    console.error('Error in /api/mark-synced:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error while updating sync status.' 
    });
  }
});
// =====================================================================
app.post('/api/sync-leetcode', async (req, res) => {
    const { uid, cookie, csrf_token } = req.body;
    if (!uid || !cookie) {
        return res.status(400).json({ error: "Missing uid or session cookie strings" });
    }

    const connection = await pool.getConnection();
    try {
        // Forward credentials over to Python microservice
        const pythonResponse = await axios.post('http://127.0.0.1:8000/engine/fetch-ids', { 
            cookie,
            csrf_token 
        });
        
        const { solved_ids } = pythonResponse.data;

        await connection.beginTransaction();

        if (solved_ids && solved_ids.length > 0) {
            for (const qid of solved_ids) {
                await connection.execute(
                    'INSERT IGNORE INTO user_solved_history (uid, question_number) VALUES (?, ?)', 
                    [uid, qid]
                );
                // Solved via sync now, so it's no longer "difficult"
                await connection.execute(
                    'DELETE FROM user_difficult_history WHERE uid = ? AND question_number = ?',
                    [uid, qid]
                );
            }

            await refreshUserProfileVector(connection, uid);
        }

        // Mark user as synced in users table
        await connection.execute(
            'UPDATE users SET synced = 1 WHERE uid = ?',
            [uid]
        );

        await connection.commit();

        return res.json({ success: true, synced_count: solved_ids ? solved_ids.length : 0 });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error("Sync Error:", err.message);
        return res.status(500).json({ error: "Failed to sync LeetCode solved problems." });
    } finally {
        if (connection) connection.release();
    }
});
// =====================================================================
// API 3: Get Vector Recommendation
// =====================================================================
app.post('/api/get-next', async (req, res) => {
    // boost_topics / suppress_topics: arrays of topic name strings picked
    // by the user AT REQUEST TIME (not saved to DB, just a filter on this
    // one recommendation call — matches how `difficulty` already works).
    const { uid, difficulty, topic, boost_topics = [], suppress_topics = [] } = req.body;
    if (!uid) {
        return res.status(400).json({ error: "Missing uid validation block" });
    }

    try {
        const [userRows] = await pool.execute('SELECT user_vector FROM users WHERE uid = ?', [uid]);
        if (userRows.length === 0 || !userRows[0].user_vector) {
            return res.status(400).json({ error: "User vector layout is blank. Sync profile data first." });
        }
        
        const userVector = typeof userRows[0].user_vector === 'string' ? JSON.parse(userRows[0].user_vector) : userRows[0].user_vector;

        let query = `
            SELECT question_number, title, difficulty, question_vector 
            FROM questions 
            WHERE question_number NOT IN (
                SELECT question_number FROM user_solved_history WHERE uid = ?
            )
        `;
        let queryParams = [uid];

        if (difficulty) {
            query += " AND difficulty = ?";
            queryParams.push(difficulty);
        }

        const [candidateRows] = await pool.execute(query, queryParams);
        if (candidateRows.length === 0) {
            return res.status(404).json({ message: "No uncompleted vector matches exist for these filters." });
        }

        // Pull this user's "found difficult" history so struggled-with
        // questions can be nudged back up the recommendation list.
        const [difficultRows] = await pool.execute(
            'SELECT question_number, times_marked FROM user_difficult_history WHERE uid = ?',
            [uid]
        );
        const difficult_questions = difficultRows.map(row => ({
            id: row.question_number,
            times_marked: row.times_marked
        }));

        const candidatesPayload = candidateRows.map(row => ({
            id: row.question_number,
            vector: typeof row.question_vector === 'string' ? JSON.parse(row.question_vector) : row.question_vector
        }));

        const pythonMatchResponse = await axios.post('http://127.0.0.1:8000/engine/calculate-similarity', {
            user_vector: userVector,
            candidates: candidatesPayload,
            boost_topics,
            suppress_topics,
            difficult_questions
        });

        const { recommended_id, score } = pythonMatchResponse.data;

        const [finalProblem] = await pool.execute(
            'SELECT question_number, title, difficulty FROM questions WHERE question_number = ?',
            [recommended_id]
        );

        return res.json({
            recommended_problem: finalProblem[0],
            similarity_match: score
        });

    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Internal microservice connection mismatch error." });
    }
});

// =====================================================================
// VIRTUAL CONTEST FEATURE
// No new tables. This just picks 4 random UNSOLVED questions (1 easy,
// 2 medium, 1 hard). The timer runs entirely in the browser. When the
// user marks a question solved/difficult during the contest, the page
// calls the SAME /api/add-solved and /api/mark-difficult endpoints
// used everywhere else — so it's always the real, single source of
// truth (user_solved_history / user_difficult_history), and a question
// can never be suggested again once solved, contest or not.
// =====================================================================

// Helper: picks `count` random UNSOLVED questions of a given difficulty
async function pickRandomUnsolved(uid, difficulty, count) {
    const [rows] = await pool.execute(
        `SELECT question_number, title, difficulty FROM questions
         WHERE difficulty = ?
           AND question_number NOT IN (
               SELECT question_number FROM user_solved_history WHERE uid = ?
           )
         ORDER BY RAND()
         LIMIT ${Number(count)}`,
        [difficulty, uid]
    );
    return rows;
}

// POST /api/contest/generate — returns 4 fresh unsolved questions
// (1 easy, 2 medium, 1 hard). Nothing is written to the database here;
// it's just a selection. Marking happens through the existing
// add-solved / mark-difficult endpoints as the user works through them.
app.post('/api/contest/generate', async (req, res) => {
    const { uid } = req.body;
    if (!uid) {
        return res.status(400).json({ error: "Missing uid" });
    }

    try {
        const easy = await pickRandomUnsolved(uid, 'Easy', 1);
        const medium = await pickRandomUnsolved(uid, 'Medium', 2);
        const hard = await pickRandomUnsolved(uid, 'Hard', 1);

        if (easy.length < 1 || medium.length < 2 || hard.length < 1) {
            return res.status(404).json({ error: "Not enough unsolved questions left to build a contest (need 1 easy, 2 medium, 1 hard)." });
        }

        return res.json({
            questions: [
                { ...easy[0], slot: 'easy' },
                { ...medium[0], slot: 'medium_1' },
                { ...medium[1], slot: 'medium_2' },
                { ...hard[0], slot: 'hard' }
            ]
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// =====================================================================
// Auth Routes
// =====================================================================
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password required' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const query = `
            INSERT INTO users (username, password_hash)
            VALUES (?, ?)
        `;

        const [result] = await pool.execute(query, [username, hashedPassword]);

        res.status(201).json({
            status: 'success',
            user: { uid: result.insertId, username: username }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Username is already taken' });
        }
        res.status(500).json({ message: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        res.status(200).json({
            status: 'success',
            user: {
                uid: user.uid,
                username: user.username,
                question_count: user.question_count,
                has_vector: !!user.user_vector
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Attach Router to Application Express Pipeline
app.use(router);

// Serve main landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'front.html'));
});

app.listen(3000, () => {
    console.log('🚀 Server up and listening on http://127.0.0.1:3000');
});
