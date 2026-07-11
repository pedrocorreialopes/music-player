# Aurora Player 🎧

Um site estático (front-end) de player de música com visual moderno e elegante, feito para reproduzir arquivos de áudio de uma **galeria** (pasta hospedada no próprio projeto), organizar em **playlists**, marcar **favoritas**, ouvir em **modo aleatório**, controlar **repetição**, ver a **fila de reprodução** e fazer **download** das faixas (individualmente ou em lote via `.zip`).

## ✅ Funcionalidades implementadas

- **Galeria de músicas**: 8 faixas de exemplo em `audio/` listadas via `js/tracks.js`, cada uma com capa, artista, álbum, gênero e ano.
- **Player completo**:
  - Play / Pause, Próxima / Anterior
  - Barra de progresso arrastável com tempo atual/total
  - Controle de volume com mute
  - Modo **aleatório** (shuffle) 
  - **Repetição**: desativada → repetir fila → repetir uma faixa
  - Visualizador animado (equalizador) e disco giratório na Home
  - Atalhos de teclado: `Espaço` (play/pause), `←`/`→` (anterior/próxima)
- **Fila de reprodução** visível e editável (remover itens, exceto o que está tocando)
- **Playlists**:
  - Criar, excluir, adicionar/remover faixas
  - Reproduzir playlist inteira
  - Baixar todas as faixas da playlist em um único arquivo `.zip` (via JSZip)
- **Favoritas**: marcar/desmarcar com ♥, view dedicada
- **Download individual** de qualquer faixa (botão na lista e na barra do player)
- **Busca** por título, artista ou álbum (view Galeria)
- **Ordenação** por título, artista ou ano
- **Adicionar pasta local**: permite ao usuário importar arquivos de áudio do próprio computador para a sessão atual (via `<input type="file" multiple>` e Blob URLs — não é enviado a nenhum servidor)
- **Tema claro/escuro** com alternância e persistência
- **Design responsivo** (sidebar retrátil em mobile, grid adaptável)
- **Persistência local**: playlists, favoritos, tema e volume salvos em `localStorage` (por navegador/dispositivo)
- Rodapé fixo com a assinatura: **Criado e desenvolvido por Pedro Correia Lopes Filho.**

## 🗂️ Estrutura do projeto

```
index.html          → estrutura da aplicação (todas as "views")
css/style.css        → todo o visual (glassmorphism, gradientes, animações, responsividade)
js/tracks.js          → manifesto da galeria de áudio (metadados das faixas)
js/app.js             → toda a lógica: player, fila, playlists, favoritos, busca, downloads
audio/track-01..08.mp3→ arquivos de áudio de exemplo (galeria do servidor)
images/cover-01..08.jpg → capas ilustrativas usadas nas faixas
```

## 🔗 Entradas/rotas funcionais

Este é um site de página única (SPA simples), então não há múltiplas URLs — tudo ocorre em:

- `index.html` — única página. A navegação entre "Início", "Galeria", "Playlists", "Favoritas" e "Fila de reprodução" é feita via JavaScript (troca de seções), sem parâmetros de URL.

Não há endpoints de API externos: os dados de playlists/favoritos ficam no `localStorage` do navegador do usuário; os áudios são arquivos estáticos servidos da pasta `audio/`.

## 🧱 Modelo de dados

**Faixa (em `js/tracks.js`)**
```js
{
  id, title, artist, album, genre, year, cover, src
}
```

**Playlist (persistida em `localStorage` → chave `aurora_playlists_v1`)**
```js
{ id, name, trackIds: [] }
```

**Favoritos** (`localStorage` → chave `aurora_favorites_v1`): array de ids de faixas.

**Preferências**: tema (`aurora_theme_v1`) e volume (`aurora_volume_v1`).

> ⚠️ Observação importante: por se tratar de um site **estático**, não há banco de dados nem backend. Playlists e favoritos são salvos **localmente no navegador** de cada visitante (não sincronizam entre dispositivos/usuários). Os arquivos de áudio "locais" adicionados via "Adicionar pasta local" existem apenas durante a sessão atual (Blob URLs) e não são enviados a lugar nenhum.

## 🚧 Não implementado / limitações conhecidas

- Não há login/contas de usuário nem sincronização de playlists entre dispositivos (exigiria backend com autenticação — fora do escopo de um site estático).
- Arquivos adicionados via "pasta local" não são incluídos em downloads `.zip` de playlists caso o navegador bloqueie o `fetch` do blob (funciona na maioria dos navegadores modernos).
- Não há upload de novos arquivos de áudio para o "servidor" da galeria propriamente (a galeria é fixa em `js/tracks.js` + pasta `audio/`); para adicionar novas faixas permanentes à galeria seria necessário incluir o arquivo na pasta `audio/` e um novo registro em `js/tracks.js`.
- Não há letras de música, equalizador com bandas manuais, nem rádio/streaming externo.

## 🔮 Próximos passos recomendados

1. Adicionar mais faixas reais do usuário na pasta `audio/` e cadastrá-las em `js/tracks.js`.
2. Se desejar sincronizar playlists entre dispositivos, seria necessário usar a Table API (dados) — pode-se armazenar playlists/favoritos numa tabela ao invés de `localStorage`.
3. Adicionar letras (lyrics) sincronizadas por faixa.
4. Adicionar suporte a formatos adicionais (ex.: `.ogg`, `.wav`) e metadados via ID3 (biblioteca JS de leitura de tags).
5. Melhorar acessibilidade com testes de leitor de tela em todos os fluxos de modais.

## 🎨 Bibliotecas utilizadas (via CDN)

- **Font Awesome 6** — ícones
- **Google Fonts** (Outfit + Manrope) — tipografia
- **JSZip** — geração de arquivos `.zip` para download de playlists

## 🚀 Publicação

Para publicar o site e obter uma URL pública, utilize a aba **Publish** do ambiente — ela cuidará de todo o processo de deploy automaticamente.

---

Criado e desenvolvido por **Pedro Correia Lopes Filho**.
