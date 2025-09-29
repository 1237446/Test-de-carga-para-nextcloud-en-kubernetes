import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const user_data = new SharedArray('users', function() {
  const fileContent = open('./usuarios.txt');
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');

  const users = lines.map(line => {
    const parts = line.split(',');
    return {
      username: parts[0].trim(),
      password: parts[1].trim()
    };
  });
  return users;
});

export let options = {
  vus: 1000, // Número de usuarios virtuales
  duration: '10m', // Duración total de la prueba
};

const BASE_URL = 'https://apu.uni.edu.pe'; // Reemplaza con la URL de tu instancia de Nextcloud
const loginFailures = new Counter('login_failures'); // Contador para fallos de login

export default function () {
  const vu_id = __VU; 
  const user_index = vu_id - 1;

  if (user_index >= user_data.length) {
    console.error(`Not enough users for VU ${vu_id}. Stopping.`);
    return;
  }
  
  const user = user_data[user_index];
  const USERNAME = user.username;
  const PASSWORD = user.password;
  
  const jar = http.cookieJar();
  // Inicializar la cookie jar para manejar sesiones
  group('User Flow: Nextcloud', function () {
    const loginPayload = {
      user: USERNAME,
      password: PASSWORD,
    };

    // Realizar login
    const loginRes = http.post(`${BASE_URL}/login`, loginPayload, {
      jar: jar,
    });
    // Verificar que el login haya sido exitoso
    check(loginRes, {
      '1. Login successful': (r) => r.status === 200,
    });
    // Contar fallos de login
    if (loginRes.status !== 200) {
      console.error(`Login failed for VU ${vu_id} (user: ${USERNAME}): Status ${loginRes.status}`);
      loginFailures.add(1);
      return;
    }
    sleep(2);

    // Acceso a dashboard
    const dashboardRes = http.get(`${BASE_URL}/login?redirect_url=/apps/dashboard/`, {
      jar: jar,
    });
    // Verificar que el dashboard se haya cargado correctamente
    check(dashboardRes, {
      '2. Dashboard loaded': (r) => r.status === 200,
    });
    sleep(2);

    // Acceso a carpeta de archivos
    const folderRes = http.get(`${BASE_URL}/login?redirect_url=/apps/files/files`, {
      jar: jar,
    });
    // Verificar que la carpeta se haya cargado correctamente
    check(folderRes, {
      '3. Folder page loaded': (r) => r.status === 200,
    });
    sleep(2);

    // Acceso a Collabora
    // const viewFileUrl = `${BASE_URL}/login?redirect_url=/apps/files/files/850?dir=/Documentos&editing=false&openfile=true`;
    // const viewFileRes = http.get(viewFileUrl, {
    //   jar: jar,
    // });
    // // Verificar que la página del archivo se haya cargado correctamente
    // check(viewFileRes, {
    //   '4. File view page loaded': (r) => r.status === 200,
    // });
    // sleep(2);

    // Descargar un archivo específico
    const downloadUrl = `${BASE_URL}/login?redirect_url=/remote.php/dav/files/${USERNAME}/Documents/Readme.md`;
    const downloadRes = http.get(downloadUrl, {
      jar: jar,
    });
    // Verificar que el archivo se haya descargado correctamente
    check(downloadRes, {
      '5. File downloaded': (r) => r.status === 200,
    });
    sleep(Math.random() * 3 + 1);
  });
}
