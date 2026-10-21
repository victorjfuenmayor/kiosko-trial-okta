# Reproducir la POC CompuCaja (Kiosko) en un org de Okta nuevo

Cubre los casos de uso de las apps de tienda (casos #3 y #4 del documento de POV):
login OIDC con PKCE, acceso por tienda según grupo, claims extra (StoreID, Hostname, etc.)
inyectados con Token Inline Hook y una API que valida el access token.

Tiempo estimado: 30-40 minutos.

## 0. Arquitectura

```
Browser ──> client-new (:3001) ──redirect──> Okta (/oauth2/default/v1/authorize?...&StoreID=..)
                                               │  Token Inline Hook (HTTPS, ngrok)
                                               ▼
                                   token-inline-hook-extraParams (:3000)
Browser ──Bearer access_token──> okta-api-service (:3002)  (valida firma, aud y scope)
```

| Carpeta | Puerto | Rol |
|---|---|---|
| `client-new` | 3001 | Frontend CompuCaja (okta-auth-js 7.5, PKCE) |
| `okta-api-service` | 3002 | API de transacciones, valida el token con `@okta/jwt-verifier` |
| `token-inline-hook-extraParams` | 3000 | Recibe el hook de Okta y agrega los query params del `/authorize` como claims |

Requisitos: Node 18+, cuenta de ngrok (gratis) y navegador.

## 1. Crear el org de Okta

1. Registrarse en <https://developer.okta.com/signup> (org Integrator Free, ya viene en OIE).
2. Anotar el **Okta domain** (ej. `https://integrator-1234567.okta.com`) y entrar como admin.

## 2. Atributo de tienda, grupos y usuarios

El acceso por tienda se decide con el claim `groups`: el cliente exige que el usuario
pertenezca a un grupo cuyo nombre sea **idéntico** al valor del dropdown (`Tienda 1` ... `Tienda 5`).
En la POC el número de tienda era un atributo del perfil y los grupos se derivaban de él.

1. **Atributo.** Directory > Profile Editor > User (default) > *Add Attribute*:
   tipo string, Display name `Tienda`, Variable name `storeNumber`.
2. **Grupos.** Directory > Groups > *Add group*: `Tienda 1`, `Tienda 2`, `Tienda 3`, `Tienda 4`, `Tienda 5`
   (con ese espacio y mayúscula exactos).
3. **Group rules** (opcional, replica la POC). Directory > Groups > Rules > *Add rule*, una por tienda:
   - Condición: `user.storeNumber=="Tienda 1"`
   - Acción: asignar al grupo `Tienda 1`
   - Activar la regla.
   Si prefieres no usar reglas, asigna los usuarios a mano a cada grupo.
4. **Usuarios de prueba.** Directory > People > *Add person*, mínimo dos:
   - `user1@...` con `storeNumber = Tienda 1`
   - `user2@...` con `storeNumber = Tienda 2`
   Asignarles contraseña y activarlos.

## 3. Trusted Origin

Security > API > Trusted Origins > *Add Origin*:
- Origin URL `http://localhost:3001`
- Marcar **CORS** y **Redirect**.

## 4. App OIDC (SPA)

Applications > Create App Integration > **OIDC - OpenID Connect** > **Single-Page Application**.

- Name: `CompuCaja`
- Grant types: **Authorization Code** y **Refresh Token**
- Sign-in redirect URI: `http://localhost:3001/client`
- Sign-out redirect URI: `http://localhost:3001/client`
- Controlled access: *Allow everyone in your organization* (o asignar los grupos `Tienda N`)

Guardar y copiar el **Client ID**.

## 5. Authorization Server `default`

Security > API > Authorization Servers > `default`.

1. **Audience**: dejar `api://default`.
2. **Scopes** > *Add Scope*:
   - `transactions:write` (descripción libre, Default scope: no)
   - `groups` (Include in public metadata: sí)
3. **Claims** > *Add Claim*:
   - Name `groups`
   - Include in token type: **ID Token**, *Always*
   - Value type: **Groups**
   - Filter: **Starts with** `Tienda`
   - Include in: *Any scope*

   El cliente lee los grupos con `oktaAuth.getUser()` (userinfo). Si el login normal dice
   "Group information missing", crea además el mismo claim para **Access Token**.
4. **Access Policies**: si no hay ninguna, *Add New Access Policy* con Assign to *The following clients*: `CompuCaja`.
   Dentro de la policy, *Add Rule*:
   - Grant type: Authorization Code
   - User: any user assigned the app
   - Scopes requested: *Any scopes*
   - Dejar los tiempos por defecto (access token de 1 h; para el demo puedes bajarlo a 5 min)

   El paso del inline hook se completa en la sección 7.

## 6. Levantar las apps y ngrok

Editar los valores del org nuevo:

| Archivo | Líneas | Qué cambiar |
|---|---|---|
| [client-new/client.html](client-new/client.html#L108-L112) | 108-112 | `OKTA_ORG_URL`, `OKTA_CLIENT_ID` |
| [okta-api-service/server.js](okta-api-service/server.js#L10-L13) | 10-13 | `OKTA_ORG_URL`, `OKTA_CLIENT_ID` |

`OKTA_ORG_URL` es el dominio del paso 1, sin `/` final. Los puertos y `REDIRECT_URI` quedan igual.

En tres terminales:

```bash
# Terminal 1 - hook
cd token-inline-hook-extraParams && npm install && node index.js        # :3000

# Terminal 2 - API
cd okta-api-service && npm install && node server.js                    # :3002

# Terminal 3 - cliente
cd client-new && npm install && npm start                               # :3001
```

Cuarta terminal, para exponer el hook:

```bash
ngrok http 3000
```

Copiar la URL `https://xxxx.ngrok-free.app`. Cambia cada vez que reinicias ngrok (plan gratis),
y entonces hay que actualizarla en el hook de Okta.

## 7. Token Inline Hook

1. Workflow > Inline Hooks > *Add Inline Hook* > **Token**.
   - Name: `Demo Inline Hook`
   - URL: `https://xxxx.ngrok-free.app/okta-inline-hook`
   - Authentication: ninguna (como en la POC). Ver "Endurecimiento" abajo.
2. Security > API > Authorization Servers > `default` > Access Policies > la regla del paso 5.4 >
   *Edit* > **Use this inline hook** > seleccionar `Demo Inline Hook` > Save.

## 8. Pruebas

Abrir `http://localhost:3001/client`.

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Dropdown `Tienda 1`, *Login with Okta* con `user1` | Entra; se ven los claims con `groups: ["Tienda 1"]` |
| 2 | Dropdown `Tienda 2`, login con `user1` | Modal "Access Denied" y signOut (caso #4.3) |
| 3 | Con `user1` en Tienda 1, *Login for Transaction Token (with Extra Params)* | Entra; el access token trae `StoreID`, `StoreNumber`, `Hostname`, `HostIP` y `hookdemo` (caso #4.2) |
| 4 | *Call API (Current Session)* tras la prueba 3 | 200 con `transactionId` (caso #4.4); el servidor loguea todos los claims |
| 5 | *Call API* tras un login normal (prueba 1) | 403 `Missing required scope 'transactions:write'` |

Para ver los claims: en la consola del navegador queda el access token completo; pégalo en <https://jwt.io>.
Otra opción es Reports > System Log, filtrando por `inline_hook`, o la consola del servicio del puerto 3000.

## 9. Lo que NO está en el código (se entregó solo como documentación)

- **Step-up / MFA por transacción (caso #4.5):** la app no fuerza re-autenticación.
  Opciones para implementarlo: agregar `prompt: 'login'` o `maxAge: 0` en `signInWithRedirect` de `handleTransactionLogin`,
  o una regla en la Authentication Policy de la app con *Re-authentication frequency: every sign-in attempt*.
- **Introspection, revocation y Universal Logout (casos #3.6, #3.7, #3.8):** se probaron contra los endpoints de Okta
  (`/oauth2/default/v1/introspect`, `/revoke`) y la función Universal Logout; no hay código en este repo.
- **Casos de uso #1, #2, #5 y #6 del POV** (Active Directory, MFA/FastPass, O365/EntraID, logs) son configuración de admin sin código.

## 10. Endurecimiento recomendado (la POC no lo hacía)

- **Autenticar el hook.** En el hook de Okta, configurar un header (ej. `Authorization: <secreto>`) y verificarlo en
  [index.js](token-inline-hook-extraParams/index.js) antes de procesar el body.
- **Filtrar los claims del hook.** Hoy convierte en claim *todos* los query params del `/authorize`
  (`client_id`, `state`, `code_challenge`, `redirect_uri`...). Dejar pasar solo `StoreID`, `StoreNumber`, `Hostname`, `HostIP`.
- **No confiar en valores del navegador.** `extraParams` los define el cliente, por lo que un usuario podría falsificarlos.
  En producción el contexto de caja/tienda debería venir de un canal confiable.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Error CORS o "redirect_uri mismatch" | Falta el Trusted Origin o el redirect URI no es exactamente `http://localhost:3001/client` |
| "Group information missing" | Falta el scope o el claim `groups`, o el usuario no está en ningún grupo `Tienda*` |
| Access token sin `StoreID` | El hook no está asociado a la regla, la URL de ngrok cambió, o el servicio del puerto 3000 no corre |
| API responde 401 "jwt audience invalid" | El audience del Authorization Server no es `api://default` |
| API responde 403 por scope | El token viene del login normal; usar el botón de transacción |
| Hook falla en System Log | Okta exige HTTPS público y respuesta en menos de 3 s |
