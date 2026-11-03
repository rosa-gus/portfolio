Fui responsável pelo desenvolvimento do front-end e da API serverless, pela modelagem e integração do banco de dados e pela configuração da infraestrutura e dos controles de segurança.

Organizei a solução em duas aplicações React e TypeScript dentro de um monorepo: um site público para divulgação e apoio ao abrigo e um painel privado para gestão. A interface passou a compartilhar tokens e componentes da Jaci UI, biblioteca que também desenhei e desenvolvi para o projeto.

Na infraestrutura, Cloudflare Workers e KV atendem à aplicação e ao catálogo. Rotinas agendadas alternam diariamente o cão em destaque, reorganizam o feed e removem candidaturas vencidas. O painel administrativo utiliza Cloudflare Access, com validação de JWT e políticas por identidade.
