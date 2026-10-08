# YouTube Ambiente

Extensão do Brave que faz duas coisas dentro do YouTube:

1. **Qualidade máxima automática.** Em cada vídeo, escolhe sozinha a maior resolução que o player oferece (4K, 8K, o que tiver). Refaz a escolha quando o vídeo muda e quando um anúncio acaba.
2. **Luz ambiente própria.** Pega as cores do vídeo e espalha pela aba inteira, saindo da borda do player, com o fundo do YouTube deixando a luz passar. Funciona no tema escuro e no claro, e a luz nativa do YouTube é escondida para não brigar com esta.

## Instalar

1. Abra `brave://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha esta pasta (`youtube-ambiente`).
4. Abra qualquer vídeo no YouTube. Não precisa de mais nada.

Se mexer em algum arquivo da pasta, volte em `brave://extensions` e clique no botão de recarregar da extensão, depois dê F5 na aba do YouTube.

## Opções

Clique no ícone da extensão. O painel tem:

- **Qualidade máxima:** liga e desliga.
- **Luz ambiente:** liga e desliga.
- **Intensidade** e **Desfoque** da luz (só valem com a luz ligada). Se a luz estiver forte demais ou fraca demais, é aqui que se acerta.

As opções valem na hora, sem recarregar a página.

## O que ela não faz

- Não mexe em Shorts, só em páginas de vídeo (`/watch`).
- Em tela cheia a luz some (não há aba para iluminar).
- Vídeo com proteção (filme alugado, por exemplo) não deixa copiar o quadro, então a luz não aparece nele. A qualidade continua valendo.
- A qualidade não passa do que o vídeo oferece nem do que a sua internet aguenta tocar.

## Testar

```powershell
node testes\testar-youtube.js
```

Abre um Brave descartável, sem som, carrega a extensão, toca um vídeo de verdade no YouTube e confere a qualidade e a luz. Precisa de internet. Os prints ficam em `testes\prints`.
