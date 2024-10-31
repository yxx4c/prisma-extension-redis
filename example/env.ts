import {config} from 'dotenv';
import {nonEmpty, object, parse, pipe, string, transform} from 'valibot';

config();

const schema = object({
  REDIS_HOST_NAME: string(),
  REDIS_PORT: pipe(
    string(),
    nonEmpty(),
    transform(input => Number(input)),
  ),
});

export default parse(schema, process.env);
