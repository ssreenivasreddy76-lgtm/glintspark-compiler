const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const TIMEOUT_MS = 5000; // 5 seconds max execution time

const getRunCommand = (language, filepath, binPath = '') => {
    switch (language) {
        case 'python':
        case 'python3':
            return { cmd: 'python3', args: [filepath] };
        case 'javascript':
        case 'nodejs':
            return { cmd: 'node', args: [filepath] };
        case 'java':
            return { cmd: 'java', args: [filepath] };
        case 'c':
        case 'c++':
        case 'cpp17':
            return { cmd: binPath, args: [] };
        default:
            return null;
    }
};

const getCompileCommand = (language, filepath, binPath) => {
    switch (language) {
        case 'c':
            return { cmd: 'gcc', args: [filepath, '-o', binPath] };
        case 'c++':
        case 'cpp17':
            return { cmd: 'g++', args: [filepath, '-o', binPath] };
        case 'java':
            return { cmd: 'javac', args: [filepath] };
        default:
            return null; // Interpreted languages don't need compilation
    }
};

const executeProcess = (cmd, args, stdin, timeoutMs) => {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args);
        
        let stdout = '';
        let stderr = '';
        let isKilled = false;

        const timeout = setTimeout(() => {
            isKilled = true;
            proc.kill('SIGKILL');
            resolve({ stdout, stderr, status: 'Killed (Timeout)', code: null });
        }, timeoutMs);

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        if (stdin) {
            proc.stdin.write(stdin);
            proc.stdin.end();
        }

        proc.on('close', (code) => {
            clearTimeout(timeout);
            if (!isKilled) {
                resolve({ stdout, stderr, status: code === 0 ? 'Success' : 'Error', code });
            }
        });
    });
};

app.post('/execute', async (req, res) => {
    const { language, code, stdin = '' } = req.body;
    
    if (!language || !code) {
        return res.status(400).json({ error: 'Language and code are required.' });
    }

    const sessionId = uuidv4();
    const workDir = path.join('/tmp', sessionId);
    
    try {
        await fs.mkdir(workDir, { recursive: true });

        // Map languages to file extensions
        const extMap = {
            'python': 'py', 'python3': 'py',
            'javascript': 'js', 'nodejs': 'js',
            'java': 'java', 'c': 'c', 'c++': 'cpp', 'cpp17': 'cpp'
        };

        const ext = extMap[language.toLowerCase()];
        if (!ext) {
            return res.status(400).json({ error: `Language ${language} not supported.` });
        }

        // Java requires class name to match file name
        const filename = language.toLowerCase() === 'java' ? 'Main.java' : `solution.${ext}`;
        const filepath = path.join(workDir, filename);
        const binPath = path.join(workDir, 'solution.out');

        await fs.writeFile(filepath, code);

        // 1. Compilation Step (If needed)
        const compileCmd = getCompileCommand(language.toLowerCase(), filepath, binPath);
        if (compileCmd) {
            const compileResult = await executeProcess(compileCmd.cmd, compileCmd.args, '', TIMEOUT_MS);
            if (compileResult.code !== 0) {
                return res.json({
                    stdout: '',
                    stderr: compileResult.stderr,
                    status: 'Compilation Error'
                });
            }
        }

        // 2. Execution Step
        const runCmd = getRunCommand(language.toLowerCase(), filepath, binPath);
        const runResult = await executeProcess(runCmd.cmd, runCmd.args, stdin, TIMEOUT_MS);

        res.json({
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            status: runResult.status
        });

    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    } finally {
        // Cleanup the temporary directory
        try {
            await fs.rm(workDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to cleanup directory:', workDir, e);
        }
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 GlintSpark Compiler Engine running on port ${PORT}`);
});
