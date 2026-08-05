# 11 — Template: Relatório de Entrega

**Uso obrigatório** ao fechar uma entrega (antes de chamar de “concluído”).  
Linguagem: simples e gerencial + anexos técnicos objetivos.

---

```markdown
## Relatório de Entrega — [TÍTULO]

**Data:**  
**Branch:**  
**Commit(s):**  
**Ambiente validado:** [ ] local  [ ] preview  [ ] produção  
**Publicou?** [ ] Não  [ ] Sim (quando/como)

### O que foi alterado
-

### O que NÃO foi alterado
-

### Arquivos modificados
-

### Banco / migrations
- [ ] Nenhuma
- [ ] Sim (listar):

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| | pass/fail |

### Resultados (negócio)
(Em uma frase: o que o usuário ganha / o bug que sumiu.)

### Regressões verificadas
-

### Segurança
- Secrets no diff? [ ] Não
- Webhook/auth/RLS tocados? [ ] Não  [ ] Sim — fail-closed? 

### Backup / ponto de restauração
-

### Deploy
- Healthcheck:
- URL/ambiente:

### Evidências
(prints, logs sanitizados, IDs de OS/boletim de teste — sem secrets)

### Pendências
-

### Gates G1–G16
- [ ] Atendidos / N/A justificado

### Resumo executivo (3 linhas)
1.
2.
3.
```
