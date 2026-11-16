export type ConnectionCheckStatus =
  | 'server_responded'
  | 'server_responded_permission_denied'
  | 'network_offline'
  | 'config_or_missing_db'
  | 'quota_exceeded'
  | 'service_error';

export interface ConnectionCheckResult {
  reachable: boolean;
  status: ConnectionCheckStatus;
  errorCode?: string;
  errorMessage?: string;
  userMessageAr?: string;
}

function extractErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code.toLowerCase();
  }
  return '';
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

/**
 * Classifies errors from the Firestore startup connection probe accurately.
 * Distinguishes between:
 * - expected permission-denied on the probe path (server responded, NOT proof of farm write access)
 * - network/offline failures
 * - missing database / bad configuration
 * - quota exhaustion
 * - other backend service errors
 */
export function classifyFirestoreConnectionError(error: unknown): ConnectionCheckResult {
  const code = extractErrorCode(error);
  const rawMessage = extractErrorMessage(error);
  const msg = rawMessage.toLowerCase();

  if (
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    msg.includes('permission-denied') ||
    msg.includes('missing or insufficient permissions')
  ) {
    return {
      reachable: true,
      status: 'server_responded_permission_denied',
      errorCode: code || 'permission-denied',
      errorMessage: rawMessage,
    };
  }

  if (
    code === 'not-found' ||
    code === 'firestore/not-found' ||
    code === 'invalid-argument' ||
    code === 'failed-precondition' ||
    msg.includes('database') && msg.includes('not found') ||
    msg.includes('does not exist') ||
    msg.includes('project id') ||
    msg.includes('invalid resource name')
  ) {
    return {
      reachable: false,
      status: 'config_or_missing_db',
      errorCode: code || 'config-error',
      errorMessage: rawMessage,
      userMessageAr:
        'إعدادات قاعدة البيانات غير مكتملة أو قاعدة بيانات Firestore غير موجودة. تحقق من معرف المشروع وقاعدة البيانات.',
    };
  }

  if (
    code === 'resource-exhausted' ||
    code === 'firestore/resource-exhausted' ||
    msg.includes('quota exceeded')
  ) {
    return {
      reachable: false,
      status: 'quota_exceeded',
      errorCode: code || 'resource-exhausted',
      errorMessage: rawMessage,
      userMessageAr:
        'تم بلوغ حد الاستخدام اليومي المجاني لقاعدة البيانات. يُعاد ضبط الحصة تلقائيًا في اليوم التالي.',
    };
  }

  if (
    code === 'unavailable' ||
    code === 'firestore/unavailable' ||
    code === 'deadline-exceeded' ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('offline') ||
    msg.includes('unavailable')
  ) {
    return {
      reachable: false,
      status: 'network_offline',
      errorCode: code || 'unavailable',
      errorMessage: rawMessage,
      userMessageAr: 'تعذر الوصول إلى الخادم بسبب انقطاع الشبكة أو عدم توفر الاتصال بالإنترنت.',
    };
  }

  return {
    reachable: false,
    status: 'service_error',
    errorCode: code || 'unknown',
    errorMessage: rawMessage,
    userMessageAr: 'تعذر الاتصال بخدمة Cloud Firestore حاليًا بسبب خطأ في الخدمة. حاول مجددًا بعد قليل.',
  };
}
