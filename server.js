const express=require('express'),http=require('http'),{Server}=require('socket.io'),{Pool}=require('pg'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),path=require('path'),crypto=require('crypto');

const app=express(),server=http.createServer(app),io=new Server(server),db=new Pool({connectionString:process.env.DATABASE_URL}),SECRET=process.env.JWT_SECRET;

app.use(express.json());
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.use(express.static(path.join(__dirname,'public')));

const fail=(res,msg,status=400)=>res.status(status).json({error:msg});
const token=p=>jwt.sign(p,SECRET,{expiresIn:'14d'});
const auth=(role)=>async(req,res,next)=>{
  try{
    let p=jwt.verify((req.headers.authorization||'').replace('Bearer ',''),SECRET);
    if(p.role!==role)throw 0;
    req.user=p;
    next()
  }catch(e){
    fail(res,'Sessão inválida. Entre novamente.',401)
  }
};

function card(){
  let c=[];
  for(let col=0;col<5;col++){
    let a=Array.from({length:15},(_,i)=>col*15+i+1)
      .sort(()=>Math.random()-.5)
      .slice(0,5)
      .sort((a,b)=>a-b);

    for(let row=0;row<5;row++){
      let ix=row*5+col;
      c[ix]=ix===12?null:a[row]
    }
  }
  return c
}

function lines(c,m){
  let x=c.map((n,i)=>i===12||m.includes(n)),a=[];

  for(let r=0;r<5;r++)
    a.push([0,1,2,3,4].map(i=>r*5+i));

  for(let q=0;q<5;q++)
    a.push([0,1,2,3,4].map(i=>i*5+q));

  a.push([0,6,12,18,24],[4,8,12,16,20]);

  return a.filter(z=>z.every(i=>x[i])).length
}

async function event(room,type,payload={}){
  await db.query(
    'INSERT INTO game_events(room_id,type,payload) VALUES($1,$2,$3)',
    [room,type,payload]
  );

  let x=(await db.query(
    'SELECT code FROM rooms WHERE id=$1',
    [room]
  )).rows[0];

  if(x)io.to(x.code).emit('room:update',{type,payload})
}

async function roomBy(code){
  return (await db.query(
    'SELECT * FROM rooms WHERE code=$1',
    [code]
  )).rows[0]
}

app.post('/api/admin/register',async(req,res)=>{
  let{name,email,password}=req.body;

  if(!name||!email||!password||password.length<6)
    return fail(res,'Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.');

  try{
    let r=(await db.query(
      'INSERT INTO admins(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email',
      [name,email.toLowerCase(),await bcrypt.hash(password,12)]
    )).rows[0];

    res.json({
      token:token({role:'admin',id:r.id}),
      admin:r
    })
  }catch(e){
    fail(res,'Este e-mail já está cadastrado.')
  }
});

app.post('/api/admin/login',async(req,res)=>{
  let r=(await db.query(
    'SELECT * FROM admins WHERE email=$1',
    [String(req.body.email||'').toLowerCase()]
  )).rows[0];

  if(!r||!await bcrypt.compare(req.body.password||'',r.password_hash))
    return fail(res,'E-mail ou senha incorretos.',401);

  res.json({
    token:token({role:'admin',id:r.id}),
    admin:{
      id:r.id,
      name:r.name,
      email:r.email
    }
  })
});

app.get('/api/rooms',auth('admin'),async(req,res)=>
  res.json(
    (await db.query(
      'SELECT code,name,max_players,cards_per_player,win_condition,status,admin_plays,created_at,(SELECT count(*) FROM players WHERE room_id=rooms.id) players FROM rooms WHERE admin_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    )).rows
  )
);

app.post('/api/rooms',auth('admin'),async(req,res)=>{
  let{name,maxPlayers,cards,win,adminPlays}=req.body;

  if(!name)
    return fail(res,'Informe o nome da sala.');

  let code='BINGO-'+crypto.randomBytes(2).toString('hex').toUpperCase(),
      plays=adminPlays===true||adminPlays==='true'||adminPlays==='on',
      r=(await db.query(
        'INSERT INTO rooms(code,name,admin_id,max_players,cards_per_player,win_condition,admin_plays) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          code,
          name,
          req.user.id,
          Math.max(1,Math.min(+maxPlayers||20,200)),
          Math.max(1,Math.min(+cards||1,4)),
          ['one_line','two_lines','full_card'].includes(win)?win:'one_line',
          plays
        ]
      )).rows[0],
      adminPlayer=null;

  if(plays){
    let a=(await db.query(
      'SELECT name,email FROM admins WHERE id=$1',
      [req.user.id]
    )).rows[0];

    let cardsData=Array.from(
      {length:r.cards_per_player},
      card
    );

    adminPlayer=(await db.query(
      'INSERT INTO players(room_id,name,email,password_hash,cards,is_admin) VALUES($1,$2,$3,$4,$5,true) RETURNING *',
      [
        r.id,
        a.name,
        a.email,
        'ADMIN',
        JSON.stringify(cardsData)
      ]
    )).rows[0]
  }

  await event(r.id,'room_created');

  res.json({
    ...r,
    adminPlayer,
    adminPlayerToken:adminPlayer
      ?token({
        role:'player',
        id:adminPlayer.id,
        room:r.id
      })
      :null
  })
});

app.get('/api/rooms/:code',async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r)
    return fail(res,'Sala não encontrada.',404);

  res.json({
    code:r.code,
    name:r.name,
    status:r.status,
    maxPlayers:r.max_players,
    cards:r.cards_per_player,
    win:r.win_condition,
    drawn:r.drawn
  })
});

app.get('/api/rooms/:code/players',auth('admin'),async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r||r.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  res.json(
    (await db.query(
      'SELECT id,name,is_admin,created_at FROM players WHERE room_id=$1 ORDER BY created_at',
      [r.id]
    )).rows
  )
});

app.get('/api/rooms/:code/my-player',auth('admin'),async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r||r.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  let p=(await db.query(
    'SELECT id,name,cards,marked FROM players WHERE room_id=$1 AND is_admin=true',
    [r.id]
  )).rows[0];

  res.json(
    p
      ?{
        player:p,
        token:token({
          role:'player',
          id:p.id,
          room:r.id
        })
      }
      :null
  )
});

app.post('/api/rooms/:code/join',async(req,res)=>{
  let r=await roomBy(req.params.code),
      {name,email,password}=req.body;

  if(!r)
    return fail(res,'Sala não encontrada.',404);

  if(r.status!=='waiting')
    return fail(res,'A partida já começou.');

  if(!name||!email||!password||password.length<6)
    return fail(res,'Preencha seus dados e use senha de no mínimo 6 caracteres.');

  let count=+(await db.query(
    'SELECT count(*) FROM players WHERE room_id=$1',
    [r.id]
  )).rows[0].count;

  if(count>=r.max_players)
    return fail(res,'A sala já atingiu o limite de participantes.');

  try{
    let cards=Array.from(
      {length:r.cards_per_player},
      card
    );

    let p=(await db.query(
      'INSERT INTO players(room_id,name,email,password_hash,cards) VALUES($1,$2,$3,$4,$5) RETURNING id,name,cards,marked',
      [
        r.id,
        name.trim(),
        email.toLowerCase(),
        await bcrypt.hash(password,12),
        JSON.stringify(cards)
      ]
    )).rows[0];

    await event(r.id,'player_joined',{name:p.name});

    res.json({
      token:token({
        role:'player',
        id:p.id,
        room:r.id
      }),
      player:p,
      room:{
        code:r.code,
        name:r.name,
        status:r.status,
        drawn:r.drawn,
        win:r.win_condition
      }
    })
  }catch(e){
    fail(res,'Nome ou e-mail já está em uso nesta sala.')
  }
});

app.post('/api/rooms/:code/login',async(req,res)=>{
  let r=await roomBy(req.params.code),
      p=r&&(await db.query(
        'SELECT id,name,cards,marked,password_hash FROM players WHERE room_id=$1 AND email=$2',
        [
          r.id,
          String(req.body.email||'').toLowerCase()
        ]
      )).rows[0];

  if(!p||!await bcrypt.compare(req.body.password||'',p.password_hash))
    return fail(res,'E-mail ou senha incorretos.',401);

  res.json({
    token:token({
      role:'player',
      id:p.id,
      room:r.id
    }),
    player:p,
    room:{
      code:r.code,
      name:r.name,
      status:r.status,
      drawn:r.drawn,
      win:r.win_condition
    }
  })
});

app.post('/api/rooms/:code/start',auth('admin'),async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r||r.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  if(r.status!=='waiting')
    return fail(res,'A partida já foi iniciada.');

  await db.query(
    "UPDATE rooms SET status='in_progress' WHERE id=$1",
    [r.id]
  );

  await event(r.id,'started');

  res.json({ok:true})
});

app.post('/api/rooms/:code/draw',auth('admin'),async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r||r.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  if(r.status!=='in_progress')
    return fail(res,'A partida não está em andamento.');

  let left=Array.from(
    {length:75},
    (_,i)=>i+1
  ).filter(n=>!r.drawn.includes(n));

  if(!left.length)
    return fail(res,'Não há mais pedras.');

  let n=left[Math.floor(Math.random()*left.length)],
      drawn=[...r.drawn,n];

  await db.query(
    'UPDATE rooms SET drawn=$1 WHERE id=$2',
    [
      JSON.stringify(drawn),
      r.id
    ]
  );

  await event(
    r.id,
    'number_drawn',
    {
      number:n,
      drawn
    }
  );

  res.json({
    number:n,
    drawn
  })
});

app.post('/api/player/mark',auth('player'),async(req,res)=>{
  let r=(await db.query(
    'SELECT rooms.*,players.cards,players.marked FROM rooms JOIN players ON players.room_id=rooms.id WHERE rooms.id=$1 AND players.id=$2',
    [
      req.user.room,
      req.user.id
    ]
  )).rows[0];

  let n=+req.body.number;

  if(!r||!r.drawn.includes(n)||!r.cards.flat().includes(n))
    return fail(res,'Só é possível marcar uma pedra sorteada da sua cartela.');

  let marked=r.marked.includes(n)
    ?r.marked.filter(x=>x!==n)
    :[...r.marked,n];

  await db.query(
    'UPDATE players SET marked=$1 WHERE id=$2',
    [
      JSON.stringify(marked),
      req.user.id
    ]
  );

  res.json({marked})
});

app.post('/api/player/bingo',auth('player'),async(req,res)=>{
  let r=(await db.query(
    'SELECT rooms.*,players.cards,players.marked FROM rooms JOIN players ON players.room_id=rooms.id WHERE rooms.id=$1 AND players.id=$2',
    [
      req.user.room,
      req.user.id
    ]
  )).rows[0];

  if(!r||r.status!=='in_progress')
    return fail(res,'Não é possível pedir Bingo agora.');

  let total=Math.max(
    ...r.cards.map(c=>lines(c,r.marked))
  );

  let valid=
    r.win_condition==='one_line'
      ?total>=1
      :r.win_condition==='two_lines'
        ?total>=2
        :r.cards.some(
          c=>c.every(
            n=>n===null||r.marked.includes(n)
          )
        );

  let q=(await db.query(
    'INSERT INTO bingo_requests(room_id,player_id,valid) VALUES($1,$2,$3) RETURNING id',
    [
      r.id,
      req.user.id,
      valid
    ]
  )).rows[0];

  await db.query(
    "UPDATE rooms SET status='reviewing' WHERE id=$1",
    [r.id]
  );

  await event(
    r.id,
    'bingo_requested',
    {
      id:q.id,
      valid
    }
  );

  res.json({valid})
});

app.get('/api/rooms/:code/requests',auth('admin'),async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r||r.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  res.json(
    (await db.query(
      "SELECT b.id,b.valid,b.created_at,p.name,p.cards,p.marked FROM bingo_requests b JOIN players p ON p.id=b.player_id WHERE b.room_id=$1 AND b.status='pending' ORDER BY b.created_at",
      [r.id]
    )).rows
  )
});

app.post('/api/requests/:id/resolve',auth('admin'),async(req,res)=>{
  let q=(await db.query(
    'SELECT b.*,r.admin_id FROM bingo_requests b JOIN rooms r ON r.id=b.room_id WHERE b.id=$1',
    [req.params.id]
  )).rows[0];

  if(!q||q.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  if(req.body.approve&&q.valid){
    await db.query(
      "UPDATE bingo_requests SET status='approved' WHERE id=$1",
      [q.id]
    );

    await db.query(
      "UPDATE rooms SET status='finished',winner_player_id=$1 WHERE id=$2",
      [
        q.player_id,
        q.room_id
      ]
    );

    await event(
      q.room_id,
      'bingo_approved',
      {
        playerId:q.player_id
      }
    )
  }else{
    await db.query(
      "UPDATE bingo_requests SET status='rejected' WHERE id=$1",
      [q.id]
    );

    let pending=+(await db.query(
      "SELECT count(*) FROM bingo_requests WHERE room_id=$1 AND status='pending'",
      [q.room_id]
    )).rows[0].count;

    if(!pending)
      await db.query(
        "UPDATE rooms SET status='in_progress' WHERE id=$1",
        [q.room_id]
      );

    await event(
      q.room_id,
      'bingo_rejected'
    )
  }

  res.json({ok:true})
});

app.post('/api/rooms/:code/restart',auth('admin'),async(req,res)=>{
  let r=await roomBy(req.params.code);

  if(!r||r.admin_id!==req.user.id)
    return fail(res,'Sem permissão.',403);

  let ps=(await db.query(
    'SELECT id FROM players WHERE room_id=$1',
    [r.id]
  )).rows;

  for(let p of ps)
    await db.query(
      'UPDATE players SET cards=$1,marked=$2 WHERE id=$3',
      [
        JSON.stringify(
          Array.from(
            {length:r.cards_per_player},
            card
          )
        ),
        JSON.stringify([]),
        p.id
      ]
    );

  await db.query(
    "UPDATE rooms SET status='waiting',drawn='[]',winner_player_id=null WHERE id=$1",
    [r.id]
  );

  await event(
    r.id,
    'restarted'
  );

  res.json({ok:true})
});

io.on(
  'connection',
  s=>s.on(
    'room:join',
    code=>s.join(code)
  )
);

async function boot(){
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS admins (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text UNIQUE NOT NULL,
      name text NOT NULL,
      admin_id uuid NOT NULL REFERENCES admins(id),
      max_players int NOT NULL,
      cards_per_player int NOT NULL,
      win_condition text NOT NULL,
      status text NOT NULL DEFAULT 'waiting',
      drawn jsonb NOT NULL DEFAULT '[]',
      winner_player_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS players (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name text NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      cards jsonb NOT NULL,
      marked jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(room_id,name),
      UNIQUE(room_id,email)
    );

    CREATE TABLE IF NOT EXISTS bingo_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      valid boolean NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS game_events (
      id bigserial PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      type text NOT NULL,
      payload jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS admin_plays boolean NOT NULL DEFAULT false;

    ALTER TABLE players
      ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
  `);

  server.listen(
    3000,
    ()=>console.log('Bingo online em :3000')
  )
}

boot().catch(e=>{
  console.error(e);
  process.exit(1)
});
