// Regras do jogo isoladas do resto da aplicação: nenhuma dessas funções toca
// banco de dados ou rede, o que as torna fáceis de testar isoladamente.

function shuffle(items) {
  // Fisher-Yates: o `sort(() => Math.random() - .5)` usado na versão anterior
  // não gera uma distribuição uniforme (é um viés conhecido do JS engine).
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Cartela padrão de bingo 75 bolas: coluna B (1-15), I (16-30), N (31-45,
// centro livre), G (46-60), O (61-75).
function generateCard() {
  const card = [];
  for (let col = 0; col < 5; col++) {
    const rangeStart = col * 15 + 1;
    const options = Array.from({ length: 15 }, (_, i) => rangeStart + i);
    const picked = shuffle(options).slice(0, 5).sort((a, b) => a - b);
    for (let row = 0; row < 5; row++) {
      const index = row * 5 + col;
      card[index] = index === 12 ? null : picked[row];
    }
  }
  return card;
}

function winningLines() {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((i) => r * 5 + i));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((i) => i * 5 + c));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]); // diagonais
  return lines;
}

function countCompletedLines(card, markedNumbers) {
  const filled = card.map((n, i) => i === 12 || markedNumbers.includes(n));
  return winningLines().filter((line) => line.every((i) => filled[i])).length;
}

function isFullCard(card, markedNumbers) {
  return card.every((n) => n === null || markedNumbers.includes(n));
}

function checkWinCondition(winCondition, cards, markedNumbers) {
  if (winCondition === 'full_card') {
    return cards.some((card) => isFullCard(card, markedNumbers));
  }
  const maxLines = Math.max(...cards.map((card) => countCompletedLines(card, markedNumbers)));
  return winCondition === 'two_lines' ? maxLines >= 2 : maxLines >= 1;
}

module.exports = { generateCard, countCompletedLines, isFullCard, checkWinCondition };
