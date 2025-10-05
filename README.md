# Test de carga para nextcloud (kubernetes)
Este test esta diseñado para simular una sesion completa en nextcloud usando las aplicaciones predeterminadas del sistema para dar una aproximacion de la capicada de nextcloud

## Creacion de Usuarios

### 1\. Editar el Job de create-users.yaml (yaml)
El yaml define la cantidad de usuarios a crear ademas de los nombres y contraseñas de cada uno:

```bash
...
      containers:
      - name: nextcloud-job
        image: nextcloud:stable-apache # usar la misma imagen que usa el pod de nextcloud
        command: ["/bin/bash", "-c"]
        args:
          - |
            set -e
            # ------------------------------------------
            #  Configuracion de usuarios
            #  Define la cantidad de usuarios a usar
            # ------------------------------------------
            su -s /bin/bash -c "
              # Comando 1: Generar usuarios y contraseñas
              for i in \$(seq 1 1000); do
                username=\"test-\$i\"
                password=\$(head /dev/urandom | tr -dc A-Za-z0-9\$\#\%\& | head -c 16)
                echo \"\$username,\$password\" >> /var/www/html/usuarios.txt
              done
            # ------------------------------------------------------------------------------------------------
            #  Creacion de usuarios
            #  Crea los usuarios en nextcloud y exporta la lista en el archivo /var/www/html/usuarios.txt
            # ------------------------------------------------------------------------------------------------
              while IFS=, read -r username password; do
                echo \"Creando usuario: \$username\"
                export OC_PASS=\"\$password\"
                php occ user:add \"\$username\" --password-from-env
              done < /var/www/html/usuarios.txt
            " www-data
        # Volumenes usuados por nextcloud
        volumeMounts:
          - name: nextcloud
            mountPath: /var/www/html
...
```

### 2\. Ejecutar el Job

Una vez que tengas editado el yaml **(`create-users.yaml`)**, lo ejecutas desde la línea de comandos en Linux.

#### Comando Básico de Ejecución

```bash
kubectl apply -f /ruta/a/tu/script/create-users.yaml
```

### 3\. Extraccion de los usuarios y contraseñas

Una vez acabado el job, ingresamos al pod de nextcloud y encontraremos un archivo llamado **`usuarios.txt`**

```bash
-rw-rw-r-- 1 www-data ww-data 25892 sep 27 16:35  usuarios.txt
```

copiamos la informacion y la guardamos en un archivo en nuestro sistema con el mismo nombre

## K6

k6 es una herramienta de código abierto para pruebas de carga y rendimiento escrita en Go y diseñada para probar el rendimiento de sistemas de backend. 
Instalar **k6** en Linux es un proceso sencillo, ya que el equipo de Grafana proporciona repositorios para los principales gestores de paquetes. 

### Distribuciones Basadas en Debian (Ubuntu/Mint)

Utilizarás el gestor de paquetes `apt`.

#### 1\. Obtener la Clave GPG

Añade la clave GPG del repositorio de k6 para verificar la autenticidad del paquete:

```bash
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
```

#### 2\. Añadir el Repositorio de k6

Agrega el repositorio oficial de k6 a tu lista de fuentes de paquetes:

```bash
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
```

#### 3\. Actualizar e Instalar

Actualiza tu lista de paquetes e instala k6:

```bash
sudo apt update
sudo apt install k6
```

-----

### Distribuciones Basadas en Red Hat (CentOS/Fedora)

Utilizarás el gestor de paquetes `dnf` o `yum`.

#### 1\. Instalar la Configuración del Repositorio

Añade la configuración del repositorio de k6:

```bash
sudo dnf install https://dl.k6.io/rpm/repo.rpm
```

*(Si usas una versión antigua con `yum`, usa `sudo yum install https://dl.k6.io/rpm/repo.rpm`)*

#### 2\. Instalar k6

Instala el paquete `k6`:

```bash
sudo dnf install k6
```

*(O `sudo yum install k6` si usas `yum`)*

-----

### Usando Snap (Universal)

Si tienes `snap` instalado en tu sistema, puedes usar el paquete universal:

```bash
sudo snap install k6
```

-----

### Verificación de la Instalación

Una vez finalizada la instalación por cualquiera de los métodos, verifica que k6 esté listo ejecutando:

```bash
k6 version
```

Esto debería mostrar la versión instalada de k6, confirmando que la herramienta está lista para usarse.

## Test de carga
Para realizar una prueba de carga con k6 solo tenemos que editar los parametros de carga del script para ejecutar la prueba

-----

### 1\. Editar el Script de test.js (JavaScript)

El script de k6 define la lógica del usuario virtual: qué URLs visitar, qué datos enviar y qué esperar:

```javascript
...

  const users = lines.map(line => {
    const parts = line.split(',');
    return {
      username: parts[0].trim(),
      password: parts[1].trim()
    };
  });
  return users;
});

// ------------------------------------------
// Configuración de la Carga (Stages)
// Define cómo aumentará y disminuirá la cantidad de usuarios
// ------------------------------------------

export let options = {
  vus: 1000, // Número de usuarios virtuales
  duration: '10m', // Duración total de la prueba
};

const BASE_URL = 'https://domain.test.local'; // Reemplaza con la URL de tu instancia de Nextcloud
const loginFailures = new Counter('login_failures'); // Contador para fallos de login

...
```

-----

### 2\. Ejecutar la Prueba con K6

> [!WARNING]
> El archivo de **`test.js`** y **`usuarios.txt`** deben estar en la misma ruta

Una vez que tengas tu script **(`test.js`)**, ejecutas k6 en la misma desde la línea de comandos en Linux.

#### Comando Básico de Ejecución

Simplemente apunta k6 a tu script de prueba:

```bash
k6 run /ruta/a/tu/script/test.js
```

-----

### 3\. Analizar los Resultados Clave

Una vez que la prueba finalice, k6 mostrará un resumen como el que viste. Los valores más importantes a monitorear son:

| Métrica | Lo que Significa | Tu Problema (Latencia) |
| :--- | :--- | :--- |
| **`http_req_failed`** | El porcentaje de peticiones que fallaron. | **1.38% (falla la prueba).** |
| **`http_req_duration` (P95)** | El tiempo en el que el 95% de las peticiones fueron más rápidas. | **18.14s (latencia inaceptable).** |
| **`checks_failed`** | El porcentaje de validaciones lógicas (como el inicio de sesión exitoso) que fallaron. | **1.72% (falla la prueba).** |

```bash

         /\      Grafana   /‾‾/  
    /\  /  \     |\  __   /  /   
   /  \/    \    | |/ /  /   ‾‾\ 
  /          \   |   (  |  (‾)  |
 / __________ \  |_|\_\  \_____/ 

     execution: local
        script: /ruta/a/tu/script/test.js
        output: -

     scenarios: (100.00%) 1 scenario, 50 max VUs, 10m30s max duration (incl. graceful stop):
              * default: 50 looping VUs for 10m0s (gracefulStop: 30s)



  █ TOTAL RESULTS 

    checks_total.......: 12744   20.89251/s
    checks_succeeded...: 100.00% 12744 out of 12744
    checks_failed......: 0.00%   0 out of 12744

    ✓ 1. Login successful
    ✓ 2. Dashboard loaded
    ✓ 3. Folder page loaded
    ✓ 4. File downloaded

    HTTP
    http_req_duration..............: avg=194.67ms min=34.68ms med=72.12ms max=8.89s p(90)=301.62ms p(95)=490.24ms
      { expected_response:true }...: avg=194.67ms min=34.68ms med=72.12ms max=8.89s p(90)=301.62ms p(95)=490.24ms
    http_req_failed................: 0.00%  0 out of 15930
    http_reqs......................: 15930  26.115637/s

    EXECUTION
    iteration_duration.............: avg=9.48s    min=7.31s   med=9.3s    max=20.6s p(90)=10.67s   p(95)=11.51s  
    iterations.....................: 3186   5.223127/s
    vus............................: 1      min=1          max=50
    vus_max........................: 50     min=50         max=50

    NETWORK
    data_received..................: 237 MB 389 kB/s
    data_sent......................: 2.7 MB 4.4 kB/s




running (10m10.0s), 00/50 VUs, 3186 complete and 0 interrupted iterations
default ✓ [======================================] 50 VUs  10m0s
```
