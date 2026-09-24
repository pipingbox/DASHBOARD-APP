export function feedbackResult(persisted: boolean, uploadFailed: boolean) {
  return persisted ? (uploadFailed ? 'savedWithoutImage' : 'success') : 'error';
}
