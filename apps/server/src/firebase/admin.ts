import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;

export function getFirebaseAdminApp(): App {
  if (app) {
    return app;
  }

  const existingApp = getApps()[0];

  if (existingApp) {
    app = existingApp;
    return app;
  }

  const projectId = requiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId });
    return app;
  }

  app = initializeApp({
    credential:
      clientEmail && privateKey
        ? cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, "\n")
          })
        : serviceAccountPath
          ? cert(serviceAccountPath)
          : applicationDefault(),
    projectId
  });

  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}

export function getFirestoreDb(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
