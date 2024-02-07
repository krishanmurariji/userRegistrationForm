package com.course.gjimtloginform;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import android.content.DialogInterface;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    Spinner sp;
    boolean invalid = false;
    String Colector="";
    TextView txtalertName;
    EditText UserName,UserPassword,UserContact,UserComment;
    Button SubmitSave;
    RadioButton Malebtn,Femalbtn;
    CheckBox html,css,php;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        sp=findViewById(R.id.SpCountry);
        UserName=findViewById(R.id.userName);
        UserPassword=findViewById(R.id.userPassword);
        UserContact=findViewById(R.id.userContact);
        UserComment=findViewById(R.id.usercomment);
        txtalertName=findViewById(R.id.userAlert);
        Malebtn =findViewById(R.id.Male);
        Femalbtn=findViewById(R.id.Female);
        html=findViewById(R.id.HTML);
        css=findViewById(R.id.CSS);
        php=findViewById(R.id.PHP);
        SubmitSave=findViewById(R.id.btnSubmit);
        SubmitSave.setOnClickListener(new View.OnClickListener() {

            @Override
            public void onClick(View view) {
                String name = UserName.getText().toString();
                String contact = UserContact.getText().toString();
                String comment = UserComment.getText().toString();

                if (name.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Please fill the Name field", Toast.LENGTH_SHORT).show();
                } else if (name.equals("Sameh") || name.equals("UlHaq")) {
                    invalid = true;
                    txtalertName.setText("Name Already exists");
                } else if (contact.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Please fill the Contact field", Toast.LENGTH_SHORT).show();
                } else if (comment.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Please fill the Comment field", Toast.LENGTH_SHORT).show();
                } else {
                    StringBuilder userInfo = new StringBuilder();
                    userInfo.append("Name: ").append(name).append("\n");
                    userInfo.append("Contact No: ").append(contact).append("\n");
                    userInfo.append("Comment: ").append(comment).append("\n");

                    if (html.isChecked()) {
                        userInfo.append("Interests:").append("\n");
                        userInfo.append("- HTML").append("\n");
                        if (css.isChecked()) {
                            userInfo.append("- CSS").append("\n");
                        }
                        if (php.isChecked()) {
                            userInfo.append("- PHP").append("\n");
                        }
                    }

                    // Display user information in a dialog
                    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                    builder.setTitle("User Information");
                    builder.setMessage(userInfo.toString());
                    builder.setPositiveButton("OK", new DialogInterface.OnClickListener() {
                        public void onClick(DialogInterface dialog, int id) {
                            // Clear form fields and reset Collector variable
                            UserName.setText("");
                            UserContact.setText("");
                            UserComment.setText("");
                            html.setChecked(false);
                            css.setChecked(false);
                            php.setChecked(false);
                            dialog.dismiss();
                        }
                    });
                    AlertDialog dialog = builder.create();
                    dialog.show();
                }
            }



        });

        List<String> categoryCountry=new ArrayList<>();
        categoryCountry.add("Select Country");
        categoryCountry.add("INDIA");
        categoryCountry.add("AMERICA");
        categoryCountry.add("CANADA");
        categoryCountry.add("NEPAL");
        categoryCountry.add("FRANCE");
        ArrayAdapter<String> arrayAdapter;
        arrayAdapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_item,categoryCountry);
        arrayAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        sp.setAdapter(arrayAdapter);
        sp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long l) {
                if(parent.getItemAtPosition(position).equals("Select Country")){
                    //Do Nothing

                }
                else{
                    String item=parent.getItemAtPosition(position).toString();
                    Colector+=item+"\n";
                    Toast.makeText(MainActivity.this, "Selected Country: "+item, Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> adapterView) {

            }
        });
    }
}