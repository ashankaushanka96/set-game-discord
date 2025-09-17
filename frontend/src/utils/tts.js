// Text-to-Speech utility for game announcements

let isTTSEnabled = true;

export function setTTSEnabled(enabled) {
  isTTSEnabled = enabled;
}

export function isTTSAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text, options = {}) {
  if (!isTTSEnabled || !isTTSAvailable()) {
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set default options
  utterance.rate = options.rate || 0.9;
  utterance.pitch = options.pitch || 1.0;
  utterance.volume = options.volume || 0.8;
  utterance.lang = options.lang || 'en-US';

  // Try to use a more natural voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(voice => 
    voice.lang.startsWith('en') && 
    (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Natural'))
  );
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  window.speechSynthesis.speak(utterance);
}

export function speakGameOver(winner, teamAScore, teamBScore) {
  if (!isTTSEnabled || !isTTSAvailable()) {
    return;
  }

  let announcement;
  
  if (winner === 'tie') {
    announcement = `Game tied! Both teams scored ${teamAScore} points.`;
  } else {
    const winningScore = winner === 'A' ? teamAScore : teamBScore;
    const losingScore = winner === 'A' ? teamBScore : teamAScore;
    const scoreDifference = winningScore - losingScore;
    
    announcement = `Team ${winner} wins! ${winningScore} to ${losingScore}. Leading by ${scoreDifference} point${scoreDifference !== 1 ? 's' : ''}.`;
  }

  // Add a small delay to ensure game over sound plays first
  setTimeout(() => {
    speak(announcement, { rate: 0.8, volume: 0.9 });
  }, 2000);
}
