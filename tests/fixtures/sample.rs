pub struct User {
    pub id: String,
    pub name: String,
}

pub enum UserStatus {
    Active,
    Disabled,
}

pub trait Repository {
    fn find_user(&self, id: UserId) -> Option<User>;
}

pub type UserId = String;

pub const DEFAULT_USER_ID: &str = "1";

impl User {
    pub fn display_name(&self) -> String {
        self.name.clone()
    }
}

pub fn format_user(user: &User) -> String {
    format!("{}:{}", user.id, user.name)
}

let_default_user();

fn let_default_user() -> User {
    User {
        id: DEFAULT_USER_ID.to_string(),
        name: "Ada".to_string(),
    }
}
