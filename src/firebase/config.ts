import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  classifyFirestoreConnectionError,
  type ConnectionCheckResult,
} from './connectionCheck';

const app = initializeApp(firebaseConfig);

// CRITICAL: Pass firestoreDatabaseId explicitly to match the provisioned database
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export async function testFirestoreConnection(): Promise<ConnectionCheckResult> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { reachable: true, status: 'server_responded' };
  } catch (error) {
    const classified = classifyFirestoreConnectionError(error);
    if (!classified.reachable) {
      console.error('Firestore connection check failed:', classified.status, classified.errorMessage);
    }
    return classified;
  }
}
