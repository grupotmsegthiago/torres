# Relatório de Entrega — Reinaldo CPF / anti-duplicata

**Data:** 2026-09-15  
**Branch:** `cursor/fix-reinaldo-cpf-dup-3726`  
**Publicou?** [ ] Não (código); **dados de produção já corrigidos** com autorização explícita

## Reutilização (D11 / P13)

- Busca: `anotherEmployeeHasCpf`, `cpf-login.ts`, `POST/PATCH /api/employees`, `uniq_fornecedores_cnpj_cpf`
- Existente: `anotherEmployeeHasCpf` só no fluxo de troca de login; índice único de CNPJ/CPF em fornecedores
- Decisão: **estender** `cpf-login` (`findEmployeeCpfConflict`) + aplicar no create/update de `employees` + índice parcial no boot SQL

## ★ Causa raiz

Cadastro `employees.id=59` foi gravado como CLAUDEANO (CPF duplicado do id=56), enquanto o usuário `users.id=124` (REINALDO, login CPF `781…`) apontava para o `employee_id=59`. Reinaldo não aparecia no cadastro de funcionários com o nome dele.

## O que foi alterado

### Dados (produção, autorizado)

| id | Antes | Depois |
|----|-------|--------|
| 59 | CLAUDEANO / CPF 341… (dup do 56) | **REINALDO FERREIRA CAMPOS** / CPF `781.119.275-68`; foto/RG/PIS/telefone do Claudeano limpos |
| 24 | Mickael inativo com CPF real duplicado do 28 | CPF placeholder `000.000.000-24` (libera unicidade) |
| DB | sem índice de CPF | `uniq_employees_cpf_digits` (parcial; exclui `000.000.000-XX`) |

### Código

- `server/lib/cpf-login.ts` — placeholder vs CPF real; `findEmployeeCpfConflict`
- `server/routes/employees.ts` — POST/PATCH retornam **409** se CPF já existir
- `server/routes.ts` — `CREATE UNIQUE INDEX IF NOT EXISTS uniq_employees_cpf_digits`
- testes em `cpf-login.test.ts`

## Domínio / tipo

- Domínio: Funcionários (`employees` FATO; `users.employee_id` vínculo)
- Sem escrita financeira

## Testes

| Comando | Resultado |
|---------|-----------|
| `npx tsx --test server/lib/cpf-login.test.ts` | (rodar no CI/local do PR) |
| Prova DB: INSERT com CPF do Reinaldo | bloqueado `23505` / `uniq_employees_cpf_digits` |

## Rollback

- Código: reverter commits da branch
- Dados: restaurar nome/CPF do id=59 só com autorização (há OS históricas nesse id)
- Índice: `DROP INDEX IF EXISTS uniq_employees_cpf_digits`

## Resumo

1. TVP-0059 = Reinaldo, alinhado ao login existente.  
2. Claudeano permanece só em TVP-0056.  
3. Novo cadastro/edição com CPF já usado → 409; banco também rejeita.
